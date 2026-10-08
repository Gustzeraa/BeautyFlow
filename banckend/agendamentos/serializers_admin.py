# Coloque no app da API (ao lado do serializers.py atual)
from rest_framework import serializers
from .models import Servico, Agendamento


class ServicoAdminSerializer(serializers.ModelSerializer):
    class Meta:
        model = Servico
        fields = ["id", "nome", "preco", "duracao_minutos"]

    def validate_nome(self, valor):
        valor = valor.strip()
        if not valor:
            raise serializers.ValidationError("Informe o nome do serviço.")
        return valor

    def validate_preco(self, valor):
        if valor <= 0:
            raise serializers.ValidationError("O preço precisa ser maior que zero.")
        return valor

    def validate_duracao_minutos(self, valor):
        if valor <= 0:
            raise serializers.ValidationError("Escolha a duração do serviço.")
        return valor


class AgendamentoAdminSerializer(serializers.ModelSerializer):
    servico_nome = serializers.CharField(source="servico.nome", read_only=True)
    servico_preco = serializers.DecimalField(
        source="servico.preco", max_digits=6, decimal_places=2, read_only=True
    )

    class Meta:
        model = Agendamento
        fields = [
            "id", "nome_cliente", "whatsapp",
            "servico", "servico_nome", "servico_preco",
            "data_hora_inicio", "data_hora_fim",
        ]