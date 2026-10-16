from rest_framework.throttling import AnonRateThrottle, UserRateThrottle


class LoginThrottle(AnonRateThrottle):
    """Limita tentativas de login por IP (painel e Google). Taxa em settings: 'login'."""
    scope = 'login'


class AgendarThrottle(UserRateThrottle):
    """Limita quantos agendamentos uma cliente pode tentar. Taxa em settings: 'agendar'."""
    scope = 'agendar'