#!/usr/bin/env bash

# EstetiSafe - Stripe Payment Gateway Setup
# Use este script para configurar facilmente as chaves do Stripe no ambiente.

ENV_PATH="./backend/backend/.env"

echo "=================================================="
echo "   EstetiSafe - Stripe Payment Gateway Setup      "
echo "=================================================="
echo ""

if [ ! -f "$ENV_PATH" ]; then
    echo "Erro: Arquivo .env nao encontrado em $ENV_PATH"
    echo "Criando um novo arquivo .env a partir do exemplo..."
    cp ./backend/backend/.env.example "$ENV_PATH"
fi

echo "Para ativar o Stripe, voce precisara informar:"
echo "1. A chave secreta de API (STRIPE_SECRET_KEY) obtida no painel do Stripe"
echo "2. O segredo de assinatura do Webhook (BILLING_WEBHOOK_SECRET ou STRIPE_WEBHOOK_SECRET)"
echo ""

read -r -p "Digite a STRIPE_SECRET_KEY (comeca com sk_live_ ou sk_test_): " stripe_key
read -r -p "Digite o BILLING_WEBHOOK_SECRET (comeca com whsec_): " webhook_secret

if [ -z "$stripe_key" ] || [ -z "$webhook_secret" ]; then
    echo ""
    echo "Aviso: Nenhuma chave informada. Operacao cancelada."
    exit 1
fi

update_env_var() {
    local key=$1
    local value=$2
    # Normaliza as aspas
    if grep -q "^$key=" "$ENV_PATH"; then
        # No macOS/Linux o sed funciona de forma geral assim
        sed -i "s|^$key=.*|$key=\"$value\"|" "$ENV_PATH" 2>/dev/null || \
        sed -i.bak "s|^$key=.*|$key=\"$value\"|" "$ENV_PATH" 2>/dev/null
        rm -f "${ENV_PATH}.bak"
    else
        echo "$key=\"$value\"" >> "$ENV_PATH"
    fi
}

echo ""
echo "Atualizando configuracoes em $ENV_PATH..."

update_env_var "BILLING_GATEWAY_PROVIDER" "STRIPE"
update_env_var "STRIPE_SECRET_KEY" "$stripe_key"
update_env_var "BILLING_WEBHOOK_SECRET" "$webhook_secret"
update_env_var "STRIPE_WEBHOOK_SECRET" "$webhook_secret"

echo ""
echo "=================================================="
echo "Configuracao do Stripe atualizada com sucesso!"
echo "Verifique o arquivo $ENV_PATH para validar."
echo "=================================================="
echo ""
