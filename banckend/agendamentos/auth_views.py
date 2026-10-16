from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from rest_framework.authentication import TokenAuthentication
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, authentication_classes, permission_classes, throttle_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Agendamento, PerfilCliente
from .throttles import LoginThrottle

User = get_user_model()


def dados_cliente(usuario, perfil):
    from .views import MAX_AGENDAMENTOS_ATIVOS, agendamentos_ativos, meses_ocupados

    ativos = agendamentos_ativos(usuario)

    # Próximo agendamento ainda não concluído (para mostrar no aviso)
    ativo = (
        Agendamento.objects.filter(cliente=usuario, data_hora_fim__gt=timezone.now())
        .select_related('servico')
        .order_by('data_hora_inicio')
        .first()
    )
    return {
        'nome': usuario.get_full_name() or usuario.email,
        'email': usuario.email,
        'foto': perfil.foto_url if perfil else '',
        'whatsapp': perfil.whatsapp if perfil else '',
        'agendamento_ativo': {
            'servico': ativo.servico.nome,
            'inicio': ativo.data_hora_inicio,
        } if ativo else None,
        'total_ativos': len(ativos),
        'meses_ocupados': [f'{ano}-{mes:02d}' for ano, mes in meses_ocupados(ativos)],  # 'YYYY-MM'
        'max_ativos': MAX_AGENDAMENTOS_ATIVOS,
    }


@api_view(['POST'])
@authentication_classes([])
@permission_classes([])
@throttle_classes([LoginThrottle])
def login_google(request):
    """Recebe o 'credential' do botão do Google, confere com o Google e devolve o token."""
    credential = request.data.get('credential')
    if not credential:
        return Response({'erro': 'Login do Google não recebido.'}, status=400)

    try:
        info = id_token.verify_oauth2_token(
            credential, google_requests.Request(), settings.GOOGLE_CLIENT_ID
        )
    except ValueError:
        return Response({'erro': 'Não foi possível validar o login com o Google.'}, status=401)

    if not info.get('email_verified'):
        return Response({'erro': 'Essa conta Google ainda não tem o e-mail verificado.'}, status=401)

    sub = info['sub']
    with transaction.atomic():
        perfil = PerfilCliente.objects.select_related('usuario').filter(google_sub=sub).first()
        if perfil:
            usuario = perfil.usuario
        else:
            usuario = User(username=f'google_{sub}')
            usuario.set_unusable_password()  # só entra pelo Google
            usuario.save()
            perfil = PerfilCliente.objects.create(usuario=usuario, google_sub=sub)

        # Mantém nome, e-mail e foto em dia com a conta Google
        usuario.first_name = info.get('given_name', '')[:150]
        usuario.last_name = info.get('family_name', '')[:150]
        usuario.email = info.get('email', '')
        usuario.save(update_fields=['first_name', 'last_name', 'email'])
        perfil.foto_url = info.get('picture', '')[:500]
        perfil.save(update_fields=['foto_url'])

    token, _ = Token.objects.get_or_create(user=usuario)
    return Response({'token': token.key, 'cliente': dados_cliente(usuario, perfil)})


@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def minha_conta(request):
    """Usado pelo front ao abrir a página para conferir se a sessão ainda vale."""
    perfil = getattr(request.user, 'perfil_cliente', None)
    return Response(dados_cliente(request.user, perfil))


@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def meus_agendamentos(request):
    """Agendamentos da cliente logada (próximos e histórico)."""
    agendamentos = (
        Agendamento.objects.filter(cliente=request.user)
        .select_related('servico')
        .order_by('-data_hora_inicio')[:50]
    )
    return Response([
        {
            'id': a.id,
            'servico': a.servico.nome,
            'preco': str(a.servico.preco),
            'inicio': a.data_hora_inicio,
            'fim': a.data_hora_fim,
            'sessao_numero': a.sessao_numero,
            'total_sessoes': a.servico.sessoes,
        }
        for a in agendamentos
    ])