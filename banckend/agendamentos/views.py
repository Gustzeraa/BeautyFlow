import uuid
from datetime import datetime, timedelta, time

from django.db import transaction
from django.utils import timezone
from rest_framework.authentication import TokenAuthentication
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Servico, Agendamento

# Horário de funcionamento do salão
# Expediente por dia da semana (0 = segunda ... 5 = sábado, 6 = domingo).
# Dia que não está aqui = studio fechado. O atendimento precisa TERMINAR até o fechamento.
SEMANA = {'abertura': time(8, 0), 'fechamento': time(19, 0), 'almoco': (time(12, 0), time(13, 0))}
SABADO = {'abertura': time(7, 0), 'fechamento': time(16, 0), 'almoco': (time(12, 0), time(13, 0))}
EXPEDIENTE = {0: SEMANA, 1: SEMANA, 2: SEMANA, 3: SEMANA, 4: SEMANA, 5: SABADO}
INTERVALO_MINUTOS = 30    # de quanto em quanto tempo os horários aparecem
FOLGA_COMBO_DIAS = 1      # combo: a cliente pode passar a sessão para o próximo dia aberto (0 = sem folga)


def proximo_dia_aberto(dia):
    """Se o dia cair num dia fechado (ex: domingo), avança para o próximo dia aberto."""
    while dia.weekday() not in EXPEDIENTE:
        dia += timedelta(days=1)
    return dia


def datas_permitidas_combo(primeira, intervalo_dias, numero_sessao):
    """Datas aceitas para a sessão N do combo: a data exata (ou o próximo dia aberto) + a folga."""
    base = proximo_dia_aberto(primeira + timedelta(days=intervalo_dias * (numero_sessao - 1)))
    permitidas = [base]
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
    if not expediente:
        return Response({
            'data': data_str,
            'servico': servico.nome,
            'fechado': True,
            'horarios_disponiveis': [],
        })

    agora = timezone.now()
    duracao = timedelta(minutes=servico.duracao_minutos)

    # Agendamentos já marcados para aquele dia
    agendamentos_do_dia = list(
        Agendamento.objects.filter(data_hora_inicio__date=data_busca).select_related('servico')
    )

    horarios_livres = []
    hora_atual = no_dia(data_busca, expediente['abertura'])
    hora_final_expediente = no_dia(data_busca, expediente['fechamento'])

    # Varre o dia de 30 em 30 minutos
    while hora_atual + duracao <= hora_final_expediente:
        fim_previsto = hora_atual + duracao

        # Pula horários que já passaram (hoje) e dias anteriores inteiros
        if (
            hora_atual > agora
            and not bate_no_almoco(hora_atual, fim_previsto, expediente)
            and not tem_conflito(hora_atual, fim_previsto, agendamentos_do_dia)
        ):
            horarios_livres.append(timezone.localtime(hora_atual).strftime('%H:%M'))

        hora_atual += timedelta(minutes=INTERVALO_MINUTOS)

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
    if inicio < no_dia(dia, expediente['abertura']) or fim > no_dia(dia, expediente['fechamento']):
        return 'está fora do funcionamento do studio'
    if bate_no_almoco(inicio, fim, expediente):
        return 'cai no horário de almoço do studio'
    return None


def montar_inicio(data_str, hora_str):
    return timezone.make_aware(datetime.strptime(f"{data_str} {hora_str}", '%Y-%m-%d %H:%M'))


@api_view(['POST'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])  # só cliente logada com o Google consegue agendar
def criar_agendamento(request):
    data_str = request.data.get('data')         # Ex: '2026-10-15'
    hora_str = request.data.get('hora')         # Ex: '12:30'
    servico_id = request.data.get('servico_id')
    nome_cliente = (request.data.get('nome_cliente') or '').strip()
    whatsapp = ''.join(c for c in str(request.data.get('whatsapp') or '') if c.isdigit())
    sessoes_extras = request.data.get('sessoes_extras') or []  # combo: [{data, hora}, ...]

    if not all([data_str, hora_str, servico_id, nome_cliente]):
        return Response({'erro': 'Preencha todos os campos.'}, status=400)
    if len(whatsapp) not in (10, 11):
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

    # Cada sessão seguinte cai no intervalo exato (ex: 15 dias depois); domingo vira segunda
    primeira = timezone.localtime(inicios[0]).date()
    for i, inicio in enumerate(inicios[1:], start=2):
        permitidas = datas_permitidas_combo(primeira, servico.intervalo_dias, i)
        if timezone.localtime(inicio).date() not in permitidas:
            opcoes = ' ou '.join(d.strftime('%d/%m') for d in permitidas)
            return Response({'erro': f'A {i}ª sessão do combo precisa ser em {opcoes}.'}, status=400)

    duracao = timedelta(minutes=servico.duracao_minutos)
    for i, inicio in enumerate(inicios):
        problema = validar_horario(inicio, inicio + duracao)
        if problema:
            sessao = f'O horário da {i + 1}ª sessão' if len(inicios) > 1 else 'Esse horário'
            return Response({'erro': f'{sessao} {problema}. Escolha outro.'}, status=400)

    # Regra do studio: um agendamento por vez. Só marca outro depois que o atual for concluído
    ativo = (
        Agendamento.objects.filter(cliente=request.user, data_hora_fim__gt=timezone.now())
        .order_by('data_hora_inicio')
        .first()
    )
    if ativo:
        quando = timezone.localtime(ativo.data_hora_inicio).strftime('%d/%m às %H:%M')
        return Response(
            {'erro': f'Você já tem um horário marcado ({quando}). '
                     'Assim que ele for concluído, você pode marcar o próximo.'},
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
                    {'erro': f'{sessao} acabou de ser reservado por outra cliente. Escolha outro.'},
                    status=409,
                )

        for i, inicio in enumerate(inicios):
            Agendamento.objects.create(
                cliente=request.user,
                nome_cliente=nome_cliente,
                whatsapp=whatsapp,
                servico=servico,
                data_hora_inicio=inicio,
                pacote=pacote,
                sessao_numero=i + 1,
            )

    # Guarda o WhatsApp no perfil para já vir preenchido no próximo agendamento
    perfil = getattr(request.user, 'perfil_cliente', None)
    if perfil and perfil.whatsapp != whatsapp:
        perfil.whatsapp = whatsapp
        perfil.save(update_fields=['whatsapp'])

    return Response({'mensagem': 'Agendamento confirmado com sucesso!'}, status=201)


@api_view(['GET'])
def listar_servicos(request):
    # Pega todos os serviços cadastrados no banco e envia pro React
    servicos = Servico.objects.all().order_by('nome').values(
        'id', 'nome', 'preco', 'duracao_minutos', 'sessoes', 'intervalo_dias'
    )
    return Response(servicos)