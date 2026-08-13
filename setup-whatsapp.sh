#!/usr/bin/env bash

# EstetiSafe - WhatsApp Meta Cloud API Setup
# Use este script para configurar facilmente as variáveis de ambiente do WhatsApp.

ENV_PATH="./backend/backend/.env"

echo "=================================================="
echo "   EstetiSafe - WhatsApp Meta Cloud API Setup     "
echo "=================================================="
echo ""

if [ ! -f "$ENV_PATH" ]; then
    echo "Erro: Arquivo .env nao encontrado em $ENV_PATH"
    echo "Criando um novo arquivo .env a partir do exemplo..."
    cp ./backend/backend/.env.example "$ENV_PATH"
fi

echo "Para ativar o WhatsApp, voce precisara informar:"
echo "1. O token de verificacao de webhook do WhatsApp (WHATSAPP_VERIFY_TOKEN)"
echo "2. O segredo do aplicativo da Meta (WHATSAPP_APP_SECRET)"
echo ""

read -r -p "Digite o WHATSAPP_VERIFY_TOKEN (verify token do webhook): " verify_token
read -r -p "Digite o WHATSAPP_APP_SECRET (meta app secret): " app_secret

if [ -z "$verify_token" ] || [ -z "$app_secret" ]; then
    echo ""
    echo "Aviso: Configuracoes incompletas. Operacao cancelada."
    exit 1
fi

update_env_var() {
    local key=$1
    local value=$2
    if grep -q "^$key=" "$ENV_PATH"; then
        sed -i "s|^$key=.*|$key=\"$value\"|" "$ENV_PATH" 2>/dev/null || \
        sed -i.bak "s|^$key=.*|$key=\"$value\"|" "$ENV_PATH" 2>/dev/null
        rm -f "${ENV_PATH}.bak"
    else
        echo "$key=\"$value\"" >> "$ENV_PATH"
    fi
}

# Gerar chave aleatoria se nao existir no .env
if ! grep -q "^WHATSAPP_TOKEN_ENCRYPTION_KEY=" "$ENV_PATH"; then
    # Gerar uma chave de 32 bytes em formato hexadecimal
    encryption_key=$(openssl rand -hex 32 2>/dev/null || od -vN 32 -An -tx1 /dev/urandom | tr -d ' \n' 2>/dev/null || echo "fallback-whatsapp-encryption-secret-key-32-chars-long")
    update_env_var "WHATSAPP_TOKEN_ENCRYPTION_KEY" "$encryption_key"
fi

echo ""
echo "Atualizando configuracoes em $ENV_PATH..."

update_env_var "WHATSAPP_VERIFY_TOKEN" "$verify_token"
update_env_var "WHATSAPP_WEBHOOK_VERIFY_TOKEN" "$verify_token"
update_env_var "WHATSAPP_APP_SECRET" "$app_secret"
update_env_var "WHATSAPP_CONFIRMATION_JOB_ENABLED" "true"

echo ""
echo "=================================================="
echo "Configuracao do WhatsApp atualizada com sucesso!"
echo "Verifique o arquivo $ENV_PATH para validar."
echo "=================================================="
echo ""
