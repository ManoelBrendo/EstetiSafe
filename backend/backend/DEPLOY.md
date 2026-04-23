# L''Appui - Guia de Deploy e Setup Local

## Backend

1. Configure o PostgreSQL e preencha `DATABASE_URL`.
2. Gere `JWT_SECRET`.
3. Ajuste `FRONTEND_URL` com as origens que vao consumir a API.
4. Suba o backend com:

```bash
npm install
npx prisma generate
npx prisma migrate deploy
npm start
```

## Frontend

1. Configure `VITE_API_URL` apontando para o backend.
2. Rode:

```bash
npm install
npm run build
```

## Ambiente local

Use estas variaveis no backend:

```env
PORT=3000
DATABASE_URL="postgresql://postgres:sua_senha@localhost:5432/lappui"
JWT_SECRET=sua_chave_longa
FRONTEND_URL=http://localhost:4173,http://10.0.2.2:4173
```

Use esta variavel no frontend:

```env
VITE_API_URL=http://localhost:3000
```

Observacoes:
- No navegador local, `localhost:3000` funciona normalmente.
- No Android Emulator, o frontend reescreve `localhost` para `10.0.2.2` automaticamente.
- Para aplicar o schema local do Prisma, rode `npx prisma db push`.
- Para popular uma conta demo com dados elegantes, rode `npm run seed:demo` no backend.

## Conta demo local

O seed cria ou reutiliza esta conta:

- E-mail: `demo@lappui.local`
- Senha: `Lappui@123`
- Clinica: `L'Appui Maison`

## Branding

- Nome tecnico do app: `L''Appui`
- Backend sugerido no Render: `lappui-backend`
- Banco sugerido: `lappui-db`
