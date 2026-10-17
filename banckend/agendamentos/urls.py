from django.urls import path, include
from rest_framework.authtoken.views import ObtainAuthToken
from rest_framework.routers import SimpleRouter

from .auth_views import login_google, meus_agendamentos, minha_conta
from .throttles import LoginThrottle
from .views import (
    criar_agendamento, criar_agendamento_admin, datas_combo, dias_bloqueados,
    horarios_disponiveis, listar_servicos,
)
from .views_admin import AgendamentoAdminViewSet, BloqueioAdminViewSet, ServicoAdminViewSet

# Rotas do painel da dona
router = SimpleRouter()
router.register('servicos', ServicoAdminViewSet, basename='admin-servicos')
router.register('agendamentos', AgendamentoAdminViewSet, basename='admin-agendamentos')
router.register('bloqueios', BloqueioAdminViewSet, basename='admin-bloqueios')

urlpatterns = [
    # Tela da cliente
    path('api/horarios-disponiveis/', horarios_disponiveis, name='horarios-disponiveis'),
    path('api/agendar/', criar_agendamento, name='criar-agendamento'),
    path('api/servicos/', listar_servicos, name='listar-servicos'),
    path('api/dias-bloqueados/', dias_bloqueados, name='dias-bloqueados'),
    path('api/datas-combo/', datas_combo, name='datas-combo'),

    # Login da cliente com Google
    path('api/auth/google/', login_google, name='login-google'),
    path('api/minha-conta/', minha_conta, name='minha-conta'),
    path('api/meus-agendamentos/', meus_agendamentos, name='meus-agendamentos'),

    # Painel
    path('api/admin/login/', ObtainAuthToken.as_view(throttle_classes=[LoginThrottle]), name='admin-login'),
    path('api/admin/agendar/', criar_agendamento_admin, name='admin-agendar'),
    path('api/admin/', include(router.urls)),
]