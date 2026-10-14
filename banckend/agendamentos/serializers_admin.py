# Coloque no app da API (ao lado do serializers.py atual)
from rest_framework import serializers
from .models import Servico, Agendamento


class ServicoAdminSerializer(serializers.ModelSerializer):
    class Meta:
        model = Servico
        fields = ["id", "nome", "preco", "duracao_minutos", "sessoes", "intervalo_dias"]

    def validate(self, dados):
        sessoes = dados.get("sessoes", getattr(self.instance, "sessoes", 1))
        intervalo = dados.get("intervalo_dias", getattr(self.instance, "intervalo_dias", 0))
        if sessoes < 1:
            raise serializers.ValidationError({"sessoes": "O serviço precisa ter pelo menos 1 sessão."})
        if sessoes > 1 and intervalo < 1:
            raise serializers.ValidationError({"intervalo_dias": "Informe de quantos em quantos dias são as sessões."})
        if sessoes == 1:
            dados["intervalo_dias"] = 0
        return dados

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
    total_sessoes = serializers.IntegerField(source="servico.sessoes", read_only=True)
    valor_sessao = serializers.SerializerMethodField()

    sessoes_combo = serializers.SerializerMethodField()

    def get_sessoes_combo(self, obj):
        # Todas as sessões do mesmo combo (inclusive de outros meses), para a folha de cancelamento
        if not obj.pacote:
            return []
        return [
            {"id": a.id, "sessao_numero": a.sessao_numero, "data_hora_inicio": a.data_hora_inicio}
            for a in Agendamento.objects.filter(pacote=obj.pacote).order_by("sessao_numero")
        ]

    def get_valor_sessao(self, obj):
        # No combo, o preço é do pacote: divide entre as sessões para a previsão do dia
        sessoes = max(obj.servico.sessoes, 1)
        return f"{obj.servico.preco / sessoes:.2f}"

    class Meta:
        model = Agendamento
        fields = [
            "id", "nome_cliente", "whatsapp",
            "servico", "servico_nome", "servico_preco",
            "data_hora_inicio", "data_hora_fim",
            "sessao_numero", "total_sessoes", "valor_sessao", "sessoes_combo",
        ]