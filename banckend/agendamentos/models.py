from datetime import timedelta

from django.conf import settings
from django.db import models


class Servico(models.Model):
    nome = models.CharField(max_length=100)
    preco = models.DecimalField(max_digits=6, decimal_places=2)
    duracao_minutos = models.IntegerField(help_text="Duração em minutos (ex: 180 para 3h)")
    # Combo: 1 = serviço avulso. 2 ou mais = pacote com várias sessões
    sessoes = models.PositiveSmallIntegerField(default=1, help_text="Quantidade de sessões do combo")
    intervalo_dias = models.PositiveSmallIntegerField(
        default=0, help_text="Dias entre uma sessão e outra (ex: 15 para quinzenal)"
    )

    def __str__(self):
        return self.nome


class PerfilCliente(models.Model):
    """Dados extras da cliente que entrou com o Google."""
    usuario = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='perfil_cliente'
    )
    google_sub = models.CharField(max_length=255, unique=True)  # id fixo da conta Google
    whatsapp = models.CharField(max_length=20, blank=True)
    foto_url = models.URLField(max_length=500, blank=True)
    criado_em = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.usuario.get_full_name() or self.usuario.email


class Agendamento(models.Model):
    cliente = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='agendamentos',
    )
    nome_cliente = models.CharField(max_length=100)
    whatsapp = models.CharField(max_length=20)
    servico = models.ForeignKey(Servico, on_delete=models.CASCADE)
    data_hora_inicio = models.DateTimeField()
    data_hora_fim = models.DateTimeField(blank=True, null=True)
    # Sessões do mesmo combo compartilham o mesmo 'pacote'
    pacote = models.UUIDField(null=True, blank=True, db_index=True)
    sessao_numero = models.PositiveSmallIntegerField(default=1)

    def save(self, *args, **kwargs):
        if self.data_hora_inicio and self.servico:
            self.data_hora_fim = self.data_hora_inicio + timedelta(minutes=self.servico.duracao_minutos)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.nome_cliente} - {self.data_hora_inicio.strftime('%d/%m %H:%M')}"


class Bloqueio(models.Model):
    """Dias em que o studio não vai atender (feriado, férias, curso...)."""
    data_inicio = models.DateField()
    data_fim = models.DateField()
    # Sem horas = dia inteiro. Com horas = só esse trecho de cada dia fica bloqueado:
    #   hora_inicio sem hora_fim -> bloqueia de hora_inicio até o fim do dia ("atende só até")
    #   hora_fim sem hora_inicio -> bloqueia do começo do dia até hora_fim ("atende só a partir de")
    hora_inicio = models.TimeField(null=True, blank=True)
    hora_fim = models.TimeField(null=True, blank=True)
    motivo = models.CharField(max_length=100, blank=True)
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['data_inicio']

    @property
    def dia_inteiro(self):
        return self.hora_inicio is None and self.hora_fim is None

    def __str__(self):
        periodo = self.data_inicio.strftime('%d/%m/%Y')
        if self.data_fim != self.data_inicio:
            periodo += f" a {self.data_fim.strftime('%d/%m/%Y')}"
        return f"{periodo} {self.motivo}".strip()