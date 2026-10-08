from django.db import models
from datetime import timedelta

class Servico(models.Model):
    nome = models.CharField(max_length=100)
    preco = models.DecimalField(max_digits=6, decimal_places=2)
    duracao_minutos = models.IntegerField(help_text="Duração em minutos (ex: 180 para 3h)")

    def __str__(self):
        return self.nome

class Agendamento(models.Model):
    nome_cliente = models.CharField(max_length=100)
    whatsapp = models.CharField(max_length=20)
    servico = models.ForeignKey(Servico, on_delete=models.PROTECT)
    data_hora_inicio = models.DateTimeField()
    data_hora_fim = models.DateTimeField(blank=True, null=True)

    def save(self, *args, **kwargs):
        if self.data_hora_inicio and self.servico:
            self.data_hora_fim = self.data_hora_inicio + timedelta(minutes=self.servico.duracao_minutos)
        super().save(*args, **kwargs)
        
    def __str__(self):
        return f"{self.nome_cliente} - {self.data_hora_inicio.strftime('%d/%m %H:%M')}"