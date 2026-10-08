from datetime import datetime, timedelta, time

from django.db import transaction
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import Servico, Agendamento

# Horário de funcionamento do salão
ABERTURA = time(8, 0)     # 08:00
FECHAMENTO = time(18, 0)  # 18:00
INTERVALO_MINUTOS = 30    # de quanto em quanto tempo os horários aparecem


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

    agora = timezone.now()
    duracao = timedelta(minutes=servico.duracao_minutos)

    # Agendamentos já marcados para aquele dia
    agendamentos_do_dia = list(
        Agendamento.objects.filter(data_hora_inicio__date=data_busca).select_related('servico')
    )

    horarios_livres = []
    hora_atual = timezone.make_aware(datetime.combine(data_busca, ABERTURA))
    hora_final_expediente = timezone.make_aware(datetime.combine(data_busca, FECHAMENTO))

    # Varre o dia de 30 em 30 minutos
    while hora_atual + duracao <= hora_final_expediente:
        fim_previsto = hora_atual + duracao

        # Pula horários que já passaram (hoje) e dias anteriores inteiros
        if hora_atual > agora and not tem_conflito(hora_atual, fim_previsto, agendamentos_do_dia):
            horarios_livres.append(timezone.localtime(hora_atual).strftime('%H:%M'))

        hora_atual += timedelta(minutes=INTERVALO_MINUTOS)

    return Response({
        'data': data_str,
        'servico': servico.nome,
        'horarios_disponiveis': horarios_livres,
    })


@api_view(['POST'])
def criar_agendamento(request):
    data_str = request.data.get('data')         # Ex: '2026-10-15'
    hora_str = request.data.get('hora')         # Ex: '12:30'
    servico_id = request.data.get('servico_id')
    nome_cliente = (request.data.get('nome_cliente') or '').strip()
    whatsapp = ''.join(c for c in str(request.data.get('whatsapp') or '') if c.isdigit())

    if not all([data_str, hora_str, servico_id, nome_cliente]):
        return Response({'erro': 'Preencha todos os campos.'}, status=400)
    if len(whatsapp) not in (10, 11):
        return Response({'erro': 'Digite o WhatsApp completo, com DDD.'}, status=400)

    try:
        servico = Servico.objects.get(id=servico_id)
        data_hora_combinada = datetime.strptime(f"{data_str} {hora_str}", '%Y-%m-%d %H:%M')
    except (Servico.DoesNotExist, ValueError):
        return Response({'erro': 'Serviço não encontrado ou data inválida.'}, status=400)

    inicio = timezone.make_aware(data_hora_combinada)
    fim = inicio + timedelta(minutes=servico.duracao_minutos)

    # Não deixa marcar no passado
    if inicio <= timezone.now():
        return Response({'erro': 'Esse horário já passou. Escolha outro.'}, status=400)

    # Não deixa marcar fora do expediente
    abertura = timezone.make_aware(datetime.combine(inicio.date(), ABERTURA))
    fechamento = timezone.make_aware(datetime.combine(inicio.date(), FECHAMENTO))
    if inicio < abertura or fim > fechamento:
        return Response({'erro': 'Esse horário está fora do funcionamento do studio.'}, status=400)

    with transaction.atomic():
        # Confere de novo na hora de salvar: outra cliente pode ter pego o horário
        # entre ela abrir a tela e clicar em confirmar
        agendamentos_do_dia = list(
            Agendamento.objects.select_for_update()
            .filter(data_hora_inicio__date=inicio.date())
            .select_related('servico')
        )
        if tem_conflito(inicio, fim, agendamentos_do_dia):
            return Response(
                {'erro': 'Esse horário acabou de ser reservado por outra cliente. Escolha outro.'},
                status=409,
            )

        Agendamento.objects.create(
            nome_cliente=nome_cliente,
            whatsapp=whatsapp,
            servico=servico,
            data_hora_inicio=inicio,
        )

    return Response({'mensagem': 'Agendamento confirmado com sucesso!'}, status=201)


@api_view(['GET'])
def listar_servicos(request):
    # Pega todos os serviços cadastrados no banco e envia pro React
    servicos = Servico.objects.all().order_by('nome').values('id', 'nome', 'preco')
    return Response(servicos)