from datetime import time

from django.utils import timezone
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.authentication import TokenAuthentication
from rest_framework.response import Response

from .models import Bloqueio, Servico, Agendamento
from .serializers_admin import AgendamentoAdminSerializer, BloqueioAdminSerializer, ServicoAdminSerializer


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

    def destroy(self, request, *args, **kwargs):
        agendamento = self.get_object()

        if agendamento.pacote:
            # Combo: cancela todas as sessões que ainda não aconteceram.
            # As que já foram feitas ficam no histórico.
            sessoes = Agendamento.objects.filter(
                pacote=agendamento.pacote, data_hora_inicio__gte=timezone.now()
            )
        else:
            sessoes = Agendamento.objects.filter(pk=agendamento.pk)

        ids = list(sessoes.values_list("id", flat=True))
        sessoes.delete()
        return Response({"cancelados": ids}, status=status.HTTP_200_OK)


class BloqueioAdminViewSet(SomenteDonaMixin, mixins.CreateModelMixin, mixins.DestroyModelMixin,
                           viewsets.ReadOnlyModelViewSet):
    """Folgas, feriados e férias: a dona bloqueia dias inteiros."""
    serializer_class = BloqueioAdminSerializer

    def get_queryset(self):
        qs = Bloqueio.objects.all()
        de = self.request.query_params.get("de")
        ate = self.request.query_params.get("ate")
        if de or ate:
            # Bloqueios que tocam o período pedido (usado pelo calendário)
            if de:
                qs = qs.filter(data_fim__gte=de)
            if ate:
                qs = qs.filter(data_inicio__lte=ate)
            return qs
        # Sem período: só os que ainda não terminaram (lista de folgas)
        return qs.filter(data_fim__gte=timezone.localdate())

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        bloqueio = serializer.save()

        # Avisa se já tinha cliente marcada nesses dias (não cancela sozinho)
        marcados = Agendamento.objects.filter(
            data_hora_inicio__date__gte=bloqueio.data_inicio,
            data_hora_inicio__date__lte=bloqueio.data_fim,
        ).order_by("data_hora_inicio")
        if not bloqueio.dia_inteiro:
            # Bloqueio parcial: só os que caem no trecho bloqueado
            ini = bloqueio.hora_inicio or time(0, 0)
            fim = bloqueio.hora_fim or time(23, 59)
            marcados = [
                a for a in marcados
                if timezone.localtime(a.data_hora_inicio).time() < fim
                and timezone.localtime(a.data_hora_fim or a.data_hora_inicio).time() > ini
            ]
        dados = dict(serializer.data)
        dados["agendamentos_no_periodo"] = [
            {
                "id": a.id,
                "nome_cliente": a.nome_cliente,
                "data_hora_inicio": a.data_hora_inicio,
            }
            for a in marcados
        ]
        return Response(dados, status=status.HTTP_201_CREATED)