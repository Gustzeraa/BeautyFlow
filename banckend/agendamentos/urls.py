from django.urls import path, include
from rest_framework.authtoken.views import obtain_auth_token
from rest_framework.routers import SimpleRouter

from .views import criar_agendamento, horarios_disponiveis, listar_servicos
from .views_admin import ServicoAdminViewSet, AgendamentoAdminViewSet

# Rotas do painel da dona
router = SimpleRouter()
router.register('servicos', ServicoAdminViewSet, basename='admin-servicos')
router.register('agendamentos', AgendamentoAdminViewSet, basename='admin-agendamentos')

urlpatterns = [
    # Tela da cliente (sem mudanças)
    path('api/horarios-disponiveis/', horarios_disponiveis, name='horarios-disponiveis'),
    path('api/agendar/', criar_agendamento, name='criar-agendamento'),
    path('api/servicos/', listar_servicos, name='listar-servicos'),

    # Painel
    path('api/admin/login/', obtain_auth_token, name='admin-login'),
    path('api/admin/', include(router.urls)),
]