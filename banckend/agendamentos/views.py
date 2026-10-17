import uuid
from datetime import datetime, timedelta, time

from django.db import transaction
from django.utils import timezone
from rest_framework.authentication import TokenAuthentication
from rest_framework.decorators import api_view, authentication_classes, permission_classes, throttle_classes
from rest_framework.permissions import IsAdminUser, IsAuthenticated
from rest_framework.response import Response

from .models import Bloqueio, Servico, Agendamento
from .throttles import AgendarThrottle

# Horário de funcionamento do salão
# Expediente por dia da semana (0 = segunda ... 5 = sábado, 6 = domingo).
# Dia que não está aqui = studio fechado. O atendimento precisa TERMINAR até o fechamento.
SEMANA = {'abertura': time(8, 0), 'fechamento': time(19, 0), 'almoco': (time(12, 0), time(13, 0))}
SABADO = {'abertura': time(7, 0), 'fechamento': time(16, 0), 'almoco': (time(12, 0), time(13, 0))}
EXPEDIENTE = {0: SEMANA, 1: SEMANA, 2: SEMANA, 3: SEMANA, 4: SEMANA, 5: SABADO}
# De quanto em quanto tempo os horários aparecem: de hora em hora quando todos os
# serviços têm duração em horas cheias; de 30 em 30 se algum tiver meia hora (ex: 1h30)
INTERVALO_HORA_CHEIA = 60
INTERVALO_MEIA_HORA = 30


def intervalo_da_agenda():
    duracoes = list(Servico.objects.values_list('duracao_minutos', flat=True))
    if all(d % 60 == 0 for d in duracoes):
        return INTERVALO_HORA_CHEIA
    return INTERVALO_MEIA_HORA

MAX_AGENDAMENTOS_ATIVOS = 4  # cliente pode deixar até 4 meses marcados, um por mês (combo conta como um só)
FOLGA_COMBO_ANTES = 1     # combo: pode adiantar a sessão para o dia aberto anterior (0 = não)
FOLGA_COMBO_DIAS = 1      # combo: pode passar a sessão para o próximo dia aberto (0 = não)


MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
         'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']


def agendamentos_ativos(cliente):
    """
    Agendamentos da cliente que ainda não terminaram, agrupados:
    as sessões de um combo contam como um agendamento só.
    Retorna uma lista de datas/horas de início (da 1ª sessão), em ordem.
    """
    inicios = {}
    for ag in Agendamento.objects.filter(cliente=cliente, data_hora_fim__gt=timezone.now()):
        chave = ag.pacote or ag.id
        if chave not in inicios or ag.data_hora_inicio < inicios[chave]:
            inicios[chave] = ag.data_hora_inicio
    return sorted(inicios.values())


def meses_ocupados(ativos):
    """Meses (ano, mês) em que a cliente já tem agendamento."""
    return sorted({(timezone.localtime(i).year, timezone.localtime(i).month) for i in ativos})


def bloqueio_do_dia(dia):
    """O bloqueio de DIA INTEIRO (folga, feriado...) que cobre esse dia, ou None."""
    return Bloqueio.objects.filter(
        data_inicio__lte=dia, data_fim__gte=dia, hora_inicio__isnull=True, hora_fim__isnull=True
    ).first()


def bloqueios_parciais(dia):
    """Trechos bloqueados nesse dia (ex: feriado em que só atende até 14h), como (início, fim)."""
    trechos = []
    parciais = Bloqueio.objects.filter(data_inicio__lte=dia, data_fim__gte=dia).exclude(
        hora_inicio__isnull=True, hora_fim__isnull=True
    )
    for b in parciais:
        inicio = no_dia(dia, b.hora_inicio or time(0, 0))
        fim = no_dia(dia, b.hora_fim) if b.hora_fim else no_dia(dia, time(23, 59))
        trechos.append((inicio, fim))
    return trechos


def bate_em_bloqueio_parcial(inicio, fim, trechos):
    return any(inicio < t_fim and fim > t_inicio for t_inicio, t_fim in trechos)


def dia_fechado(dia):
    """Dia sem atendimento: fora do expediente da semana ou bloqueado pela dona."""
    return dia.weekday() not in EXPEDIENTE or bloqueio_do_dia(dia) is not None


def proximo_dia_aberto(dia):
    """Se o dia estiver fechado (domingo, folga), avança para o próximo dia aberto."""
    for _ in range(120):  # trava de segurança contra períodos enormes de bloqueio
        if not dia_fechado(dia):
            break
        dia += timedelta(days=1)
    return dia


def dia_aberto_anterior(dia):
    """Volta até o dia aberto mais próximo (ex: domingo vira sábado)."""
    for _ in range(120):
        if not dia_fechado(dia):
            break
        dia -= timedelta(days=1)
    return dia


def datas_permitidas_combo(primeira, intervalo_dias, numero_sessao):
    """Datas aceitas para a sessão N do combo: a data exata (ou o próximo dia aberto) + a folga."""
    base = proximo_dia_aberto(primeira + timedelta(days=intervalo_dias * (numero_sessao - 1)))
    permitidas = [base]
    for _ in range(FOLGA_COMBO_ANTES):
        permitidas.insert(0, dia_aberto_anterior(permitidas[0] - timedelta(days=1)))
    for _ in range(FOLGA_COMBO_DIAS):
        permitidas.append(proximo_dia_aberto(permitidas[-1] + timedelta(days=1)))
    return permitidas


def no_dia(dia, hora):
    return timezone.make_aware(datetime.combine(dia, hora))


def bate_no_almoco(inicio, fim, expediente):
    """True se o atendimento invade o intervalo de almoço daquele dia."""
    if not expediente.get('almoco'):
        return False
    dia = timezone.localtime(inicio).date()
    almoco_inicio, almoco_fim = expediente['almoco']
    return inicio < no_dia(dia, almoco_fim) and fim > no_dia(dia, almoco_inicio)


def blocos_ocupados(dia, expediente, agendamentos):
    """Intervalos em que não dá para atender: almoço + bloqueios parciais + agendamentos do dia."""
    blocos = list(bloqueios_parciais(dia))
    if expediente.get('almoco'):
        almoco_inicio, almoco_fim = expediente['almoco']
        blocos.append((no_dia(dia, almoco_inicio), no_dia(dia, almoco_fim)))
    for ag in agendamentos:
        fim = ag.data_hora_fim or (ag.data_hora_inicio + timedelta(minutes=ag.servico.duracao_minutos))
        blocos.append((ag.data_hora_inicio, fim))
    return blocos


def deixa_buraco(inicio, fim, dia, expediente, blocos, agora, menor_servico):
    """
    True se esse horário deixa um vão antes ou depois menor que o serviço mais curto
    (tempo que ninguém conseguiria usar). Horários "encostados" em algo (abertura,
    almoço, outro atendimento, fechamento) sempre podem, para nunca sumir com uma vaga.
    """
    limite_antes = max([no_dia(dia, expediente['abertura'])] + [b[1] for b in blocos if b[1] <= inicio])
    limite_depois = min([no_dia(dia, expediente['fechamento'])] + [b[0] for b in blocos if b[0] >= fim])

    vao_antes = inicio - limite_antes
    vao_depois = limite_depois - fim
    if agora > limite_antes:
        vao_antes = timedelta(0)  # hoje: o tempo que já passou não conta como desperdício

    if vao_antes == timedelta(0) or vao_depois == timedelta(0):
        return False  # encostado de pelo menos um lado
    return vao_antes < menor_servico or vao_depois < menor_servico


def tem_conflito(inicio, fim, agendamentos):
    """Regra universal: (Início Novo < Fim Velho) E (Fim Novo > Início Velho)."""
    for ag in agendamentos:
        fim_existente = ag.data_hora_fim or (
            ag.data_hora_inicio + timedelta(minutes=ag.servico.duracao_minutos)
        )
        if inicio < fim_existente and fim > ag.data_hora_inicio:
            return True
    return False


@api_view(['GET'])
def horarios_disponiveis(request):
    data_str = request.GET.get('data')  # Ex: '2026-10-15'
    servico_id = request.GET.get('servico_id')

    if not data_str or not servico_id:
        return Response({'erro': 'Data e servico_id são obrigatórios.'}, status=400)

    try:
        servico = Servico.objects.get(id=servico_id)
        data_busca = datetime.strptime(data_str, '%Y-%m-%d').date()
    except (Servico.DoesNotExist, ValueError):
        return Response({'erro': 'Serviço não encontrado ou data inválida.'}, status=400)

    expediente = EXPEDIENTE.get(data_busca.weekday())
    bloqueio = bloqueio_do_dia(data_busca)
    if not expediente or bloqueio:
        return Response({
            'data': data_str,
            'servico': servico.nome,
            'fechado': True,
            'motivo': bloqueio.motivo if bloqueio else '',
            'horarios_disponiveis': [],
        })

    agora = timezone.now()
    duracao = timedelta(minutes=servico.duracao_minutos)
    passo = timedelta(minutes=intervalo_da_agenda())
    menor_minutos = Servico.objects.order_by('duracao_minutos').values_list('duracao_minutos', flat=True).first()
    menor_servico = timedelta(minutes=menor_minutos or servico.duracao_minutos)

    # Agendamentos já marcados para aquele dia
    agendamentos_do_dia = list(
        Agendamento.objects.filter(data_hora_inicio__date=data_busca).select_related('servico')
    )
    blocos = blocos_ocupados(data_busca, expediente, agendamentos_do_dia)
    trechos_bloqueados = bloqueios_parciais(data_busca)

    horarios_livres = []
    hora_atual = no_dia(data_busca, expediente['abertura'])
    hora_final_expediente = no_dia(data_busca, expediente['fechamento'])

    # Varre o dia de hora em hora (ou de 30 em 30, se algum serviço tiver meia hora)
    while hora_atual + duracao <= hora_final_expediente:
        fim_previsto = hora_atual + duracao

        # Pula horários que já passaram (hoje) e dias anteriores inteiros
        if (
            hora_atual > agora
            and not bate_no_almoco(hora_atual, fim_previsto, expediente)
            and not bate_em_bloqueio_parcial(hora_atual, fim_previsto, trechos_bloqueados)
            and not tem_conflito(hora_atual, fim_previsto, agendamentos_do_dia)
            # Esconde horários que deixariam um vão pequeno demais para qualquer serviço
            and not deixa_buraco(hora_atual, fim_previsto, data_busca, expediente, blocos, agora, menor_servico)
        ):
            horarios_livres.append(timezone.localtime(hora_atual).strftime('%H:%M'))

        hora_atual += passo

    return Response({
        'data': data_str,
        'servico': servico.nome,
        'fechado': False,
        'horarios_disponiveis': horarios_livres,
    })


def validar_horario(inicio, fim):
    """Retorna uma mensagem de erro ou None se o horário pode ser marcado."""
    if inicio <= timezone.now():
        return 'já passou'
    dia = timezone.localtime(inicio).date()
    expediente = EXPEDIENTE.get(dia.weekday())
    if not expediente:
        return 'cai num dia em que o studio não abre'
    if bloqueio_do_dia(dia):
        return 'cai num dia em que o studio não vai atender'
    if inicio < no_dia(dia, expediente['abertura']) or fim > no_dia(dia, expediente['fechamento']):
        return 'está fora do funcionamento do studio'
    if bate_em_bloqueio_parcial(inicio, fim, bloqueios_parciais(dia)):
        return 'está fora do horário de atendimento desse dia'
    if bate_no_almoco(inicio, fim, expediente):
        return 'cai no horário de almoço do studio'
    return None


def montar_inicio(data_str, hora_str):
    return timezone.make_aware(datetime.strptime(f"{data_str} {hora_str}", '%Y-%m-%d %H:%M'))


def reservar(dados, cliente=None, pelo_studio=False):
    """
    Lógica de agendamento usada pela tela da cliente e pelo painel da dona.
    - cliente: usuário logado com o Google (None quando a dona marca pelo painel)
    - pelo_studio: True quando é a dona marcando (WhatsApp vira opcional e
      não se aplica a regra de um agendamento por vez)
    """
    data_str = dados.get('data')         # Ex: '2026-10-15'
    hora_str = dados.get('hora')         # Ex: '12:30'
    servico_id = dados.get('servico_id')
    nome_cliente = (dados.get('nome_cliente') or '').strip()
    whatsapp = ''.join(c for c in str(dados.get('whatsapp') or '') if c.isdigit())
    sessoes_extras = dados.get('sessoes_extras') or []  # combo: [{data, hora}, ...]

    if not all([data_str, hora_str, servico_id, nome_cliente]):
        return Response({'erro': 'Preencha todos os campos.'}, status=400)
    if len(nome_cliente) > 100:
        return Response({'erro': 'Nome muito longo (máximo de 100 caracteres).'}, status=400)
    if not isinstance(sessoes_extras, list) or len(sessoes_extras) > 10:
        return Response({'erro': 'Sessões do combo inválidas.'}, status=400)
    whatsapp_obrigatorio = not pelo_studio
    if (whatsapp or whatsapp_obrigatorio) and len(whatsapp) not in (10, 11):
        return Response({'erro': 'Digite o WhatsApp completo, com DDD.'}, status=400)

    try:
        servico = Servico.objects.get(id=servico_id)
        inicios = [montar_inicio(data_str, hora_str)]
        for extra in sessoes_extras:
            inicios.append(montar_inicio(extra.get('data'), extra.get('hora')))
    except (Servico.DoesNotExist, ValueError, TypeError, AttributeError):
        return Response({'erro': 'Serviço não encontrado ou data inválida.'}, status=400)

    # Combo: precisa vir exatamente o número de sessões do serviço
    if len(inicios) != max(servico.sessoes, 1):
        return Response({'erro': f'Esse serviço tem {servico.sessoes} sessões. Escolha o horário de todas.'}, status=400)

    # Cada sessão seguinte cai no intervalo combinado (com a folga antes/depois, sem domingo)
    primeira = timezone.localtime(inicios[0]).date()
    for i, inicio in enumerate(inicios[1:], start=2):
        permitidas = datas_permitidas_combo(primeira, servico.intervalo_dias, i)
        if timezone.localtime(inicio).date() not in permitidas:
            opcoes = ', '.join(d.strftime('%d/%m') for d in permitidas)
            return Response({'erro': f'A {i}ª sessão do combo precisa ser em um destes dias: {opcoes}.'}, status=400)

    duracao = timedelta(minutes=servico.duracao_minutos)
    for i, inicio in enumerate(inicios):
        problema = validar_horario(inicio, inicio + duracao)
        if problema:
            sessao = f'O horário da {i + 1}ª sessão' if len(inicios) > 1 else 'Esse horário'
            return Response({'erro': f'{sessao} {problema}. Escolha outro.'}, status=400)

    # Regra do studio (só para quem marca pelo app): um agendamento por mês,
    # podendo deixar vários meses marcados (até MAX_AGENDAMENTOS_ATIVOS)
    if cliente is not None:
        ativos = agendamentos_ativos(cliente)
        if len(ativos) >= MAX_AGENDAMENTOS_ATIVOS:
            return Response(
                {'erro': f'Você já tem {len(ativos)} horários marcados, que é o máximo. '
                         'Assim que um deles for concluído, você pode marcar outro.'},
                status=409,
            )
        novo = timezone.localtime(inicios[0])
        if (novo.year, novo.month) in meses_ocupados(ativos):
            return Response(
                {'erro': f'Você já tem horário marcado em {MESES[novo.month - 1]}. '
                         'Escolha um dia em outro mês.'},
                status=409,
            )

    pacote = uuid.uuid4() if len(inicios) > 1 else None

    with transaction.atomic():
        # Confere de novo na hora de salvar: outra cliente pode ter pego o horário
        for i, inicio in enumerate(inicios):
            agendamentos_do_dia = list(
                Agendamento.objects.select_for_update()
                .filter(data_hora_inicio__date=timezone.localtime(inicio).date())
                .select_related('servico')
            )
            if tem_conflito(inicio, inicio + duracao, agendamentos_do_dia):
                sessao = f'O horário da {i + 1}ª sessão' if len(inicios) > 1 else 'Esse horário'
                return Response(
                    {'erro': f'{sessao} acabou de ser reservado. Escolha outro.'},
                    status=409,
                )

        for i, inicio in enumerate(inicios):
            Agendamento.objects.create(
                cliente=cliente,
                nome_cliente=nome_cliente,
                whatsapp=whatsapp,
                servico=servico,
                data_hora_inicio=inicio,
                pacote=pacote,
                sessao_numero=i + 1,
            )

    # Guarda o WhatsApp no perfil da cliente para já vir preenchido no próximo agendamento
    perfil = getattr(cliente, 'perfil_cliente', None) if cliente else None
    if perfil and whatsapp and perfil.whatsapp != whatsapp:
        perfil.whatsapp = whatsapp
        perfil.save(update_fields=['whatsapp'])

    return Response({'mensagem': 'Agendamento confirmado com sucesso!'}, status=201)


@api_view(['POST'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])  # só cliente logada com o Google consegue agendar
@throttle_classes([AgendarThrottle])
def criar_agendamento(request):
    return reservar(request.data, cliente=request.user)


@api_view(['POST'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAdminUser])  # só a dona, pelo painel
def criar_agendamento_admin(request):
    """A dona marca para clientes que não usam o app (sem conta Google)."""
    return reservar(request.data, cliente=None, pelo_studio=True)


@api_view(['GET'])
def listar_servicos(request):
    # Pega todos os serviços cadastrados no banco e envia pro React
    servicos = Servico.objects.all().order_by('nome').values(
        'id', 'nome', 'preco', 'duracao_minutos', 'sessoes', 'intervalo_dias'
    )
    return Response(servicos)


@api_view(['GET'])
def dias_bloqueados(request):
    """Dias bloqueados pela dona entre ?de= e ?ate= (YYYY-MM-DD), para o calendário."""
    try:
        de = datetime.strptime(request.GET.get('de', ''), '%Y-%m-%d').date()
        ate = datetime.strptime(request.GET.get('ate', ''), '%Y-%m-%d').date()
    except ValueError:
        return Response({'erro': 'Informe de e ate no formato AAAA-MM-DD.'}, status=400)
    if ate < de or (ate - de).days > 400:
        return Response({'erro': 'Período inválido.'}, status=400)

    dias = set()
    # Só bloqueios de dia inteiro somem do calendário; os parciais só tiram horários
    for b in Bloqueio.objects.filter(data_fim__gte=de, data_inicio__lte=ate,
                                     hora_inicio__isnull=True, hora_fim__isnull=True):
        dia = max(b.data_inicio, de)
        while dia <= min(b.data_fim, ate):
            dias.add(dia.isoformat())
            dia += timedelta(days=1)
    return Response({'dias': sorted(dias)})


@api_view(['GET'])
def datas_combo(request):
    """
    Datas aceitas para a sessão N de um combo, a partir da data da 1ª sessão.
    ?data=YYYY-MM-DD&servico_id=1&sessao=2 -> {'datas': [...], 'sugerida': '...'}
    Considera domingo, expediente e os dias bloqueados pela dona.
    """
    try:
        primeira = datetime.strptime(request.GET.get('data', ''), '%Y-%m-%d').date()
        servico = Servico.objects.get(id=request.GET.get('servico_id'))
        sessao = int(request.GET.get('sessao', 2))
    except (ValueError, TypeError, Servico.DoesNotExist):
        return Response({'erro': 'Parâmetros inválidos.'}, status=400)
    if not 2 <= sessao <= max(servico.sessoes, 2):
        return Response({'erro': 'Sessão inválida.'}, status=400)

    datas = datas_permitidas_combo(primeira, servico.intervalo_dias, sessao)
    return Response({
        'datas': [d.isoformat() for d in datas],
        'sugerida': datas[FOLGA_COMBO_ANTES].isoformat(),
    })