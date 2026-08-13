# L'Appui Mobile

Aplicativo mobile separado do SaaS web atual, criado inicialmente para Android e preparado para expansao futura para iOS.

## Escopo desta primeira base

Somente tres modulos estao incluidos:

- Documentos
- Auditoria
- Profissionais

Outros modulos do SaaS web nao foram implementados no mobile nesta etapa.

## Stack proposta

- Expo SDK 55
- React Native 0.83
- React 19.2
- TypeScript estrito

O projeto fica isolado em `mobile/` e nao altera `frontend/` nem `backend/backend/`.

## Estrutura

```text
mobile/
|- index.ts
|- App.tsx
|- app.json
|- package.json
|- tsconfig.json
|- src/
   |- mobile/
   |  |- navigation/
   |  |- screens/
   |     |- Audit/
   |     |- Documents/
   |     |- Professionals/
   |- shared/
      |- api/
      |- components/
      |- data/
      |- theme/
      |- types/
      |- utils/
```

## Rodando no Android

Instale as dependencias dentro de `mobile/`:

```bash
cd mobile
npm install
npm run android
```

No Windows, se o PowerShell bloquear `npm.ps1`, use `npm.cmd`:

```powershell
cd C:\Users\manoe\Desktop\estetisafe-deploy\mobile
$env:PATH = 'C:\Program Files\nodejs;' + $env:PATH
& 'C:\Program Files\nodejs\npm.cmd' install
& 'C:\Program Files\nodejs\npm.cmd' run start:local
```

Tambem existe um atalho local:

```text
mobile/start-mobile.cmd
```

Ele inicia o Expo usando o Node instalado em `C:\Program Files\nodejs`.

Para testar pelo Expo Go em um celular fisico na mesma rede, use:

```text
mobile/start-mobile-lan.cmd
```

ou:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run start:lan
```

Para Android Emulator acessar a API local do computador, use:

```text
EXPO_PUBLIC_API_URL=http://10.0.2.2:3000
```

O arquivo `.env.example` ja deixa essa base pronta. Em celular fisico, troque `10.0.2.2` pelo IP do computador na rede local.

## Rodando no Android Emulator local

Nesta maquina foi criado o AVD:

```text
LAppui_Pixel_8
```

Para abrir o Expo no emulador Android, use:

```text
mobile/start-mobile-android.cmd
```

Esse atalho configura:

```text
ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk
ANDROID_SDK_ROOT=%LOCALAPPDATA%\Android\Sdk
REACT_NATIVE_PACKAGER_HOSTNAME=10.0.2.2
```

O `10.0.2.2` e importante no Android Emulator porque aponta para o computador host.

## API e autenticacao

As telas tentam carregar a API real:

- `GET /documents/summary`
- `GET /documents`
- `GET /audit-logs`
- `GET /professionals`

Enquanto nao existir fluxo de login mobile, o app usa dados demo locais para permitir evoluir UX, navegacao e layout sem travar.

Esta base ja inclui uma tela simples de login mobile usando:

```text
POST /auth/login
```

O token retornado fica em memoria durante a sessao do app. Persistencia segura em armazenamento nativo deve ser adicionada depois, preferencialmente com `expo-secure-store`.

## Funcionalidades ja preparadas

- Login mobile por email e senha.
- Modo de previa sem login.
- Navegacao inferior entre os tres modulos.
- Filtros rapidos em Documentos por categoria e criticidade.
- Detalhe expandido de documento ao tocar no card.
- Cadastro basico de documento, com envio para API quando autenticado.
- Detalhe expandido de evento em Auditoria.
- Cadastro basico de profissional, com envio para API quando autenticado.
- Detalhe expandido de profissional com agenda, folha e observacoes.

Quando a autenticacao mobile for implementada, o token pode ser entregue para a camada:

```ts
setMobileAuthToken(token)
```

ou configurado temporariamente em ambiente local:

```text
EXPO_PUBLIC_LAPPUI_TOKEN=seu_token_local
```

## Direcao visual

O mobile reaproveita a identidade do SaaS:

- fundo off-white
- grafite como cor principal
- dourado suave para enfase
- verde escuro para estados seguros
- cards compactos
- textos auxiliares curtos
- navegacao inferior com tres areas

## Proximas etapas recomendadas

1. Abrir no Expo Go ou Android Emulator.
2. Validar o login mobile contra a API local.
3. Adicionar persistencia segura de sessao com `expo-secure-store`.
4. Adicionar upload de documentos com `expo-document-picker`.
5. Expandir formularios de documentos e profissionais com todos os campos do web.
6. Evoluir a navegacao para React Navigation quando houver telas internas mais profundas.

## Estado atual nesta maquina

- Node.js encontrado em `C:\Program Files\nodejs\node.exe`.
- Dependencias instaladas em `mobile/node_modules/`.
- `npm run typecheck` validado com sucesso.
- `expo install --check` validado com sucesso.
- Metro validado em `http://localhost:8081`.
- Android SDK instalado em `%LOCALAPPDATA%\Android\Sdk`.
- AVD `LAppui_Pixel_8` criado e validado.
- Expo Go instalado e app carregado no Android Emulator.

## Bloqueio atual para emulador Android

Sem bloqueio atual para emulador Android nesta maquina. Para visualizar sem abrir Android Studio, mantenha o emulador ligado e rode `mobile/start-mobile-android.cmd`.
