# Coloque no app da API (ao lado do views.py atual)
from django.utils import timezone
from rest_framework import permissions, status, viewsets, mixins
from rest_framework.authentication import TokenAuthentication
from rest_framework.response import Response

from .models import Servico, Agendamento
from .serializers_admin import ServicoAdminSerializer, AgendamentoAdminSerializer


class SomenteDonaMixin:
    """Só entra quem tem is_staff=True (o usuário criado com createsuperuser)."""
    authentication_classes = [TokenAuthentication]
    permission_classes = [permissions.IsAdminUser]
    pagination_class = None


class ServicoAdminViewSet(SomenteDonaMixin, viewsets.ModelViewSet):
    queryset = Servico.objects.all().order_by("nome")
    serializer_class = ServicoAdminSerializer

    def destroy(self, request, *args, **kwargs):
        servico = self.get_object()
        futuros = servico.agendamento_set.filter(
            data_hora_inicio__gte=timezone.now()
        ).count()
        if futuros:
            plural = "agendamentos marcados" if futuros > 1 else "agendamento marcado"
            return Response(
                {"detail": f"Este serviço tem {futuros} {plural}. "
                           "Remarque ou cancele antes de excluir."},
                status=status.HTTP_409_CONFLICT,
            )
        return super().destroy(request, *args, **kwargs)


class AgendamentoAdminViewSet(SomenteDonaMixin, mixins.DestroyModelMixin, viewsets.ReadOnlyModelViewSet):
    serializer_class = AgendamentoAdminSerializer

    def get_queryset(self):
        qs = Agendamento.objects.select_related("servico").order_by("data_hora_inicio")
        de = self.request.query_params.get("de")    # YYYY-MM-DD
        ate = self.request.query_params.get("ate")  # YYYY-MM-DD
        if de:
            qs = qs.filter(data_hora_inicio__date__gte=de)
        if ate:
            qs = qs.filter(data_hora_inicio__date__lte=ate)
        return qs