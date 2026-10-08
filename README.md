#  BeautyFlow

Sistema de agendamento online para studios de manicure. A cliente escolhe o dia, o horário e o serviço pelo celular, e a dona do studio acompanha a agenda e gerencia os serviços por um painel próprio.

## Funcionalidades

### Tela da cliente
- Calendário próprio, sem bibliotecas externas, com navegação entre meses e dias passados bloqueados
- Horários livres calculados em tempo real conforme a duração de cada serviço
- Horários que já passaram não aparecem, e o mesmo horário não pode ser marcado duas vezes
- Campo de WhatsApp com máscara automática `(00) 00000-0000`
- Tela de confirmação com resumo do agendamento
- Layout responsivo: tela cheia no celular e cartão centralizado no tablet e no desktop

### Painel da dona (`/admin`)
- Login protegido por token
- Agenda com calendário que marca os dias com atendimento
- Lista do dia com horário, cliente, serviço, valor e atalho para o WhatsApp da cliente
- Cancelamento de agendamentos, que libera o horário na hora
- Cadastro, edição e exclusão de serviços (nome, preço e duração)

## Tecnologias

| Camada    | Tecnologias                                              |
|-----------|----------------------------------------------------------|
| Front-end | React (Vite), CSS puro, Axios                            |
| Back-end  | Python, Django, Django REST Framework, Token Authentication |
| Banco     | SQLite (desenvolvimento)                                 |

## Como rodar o projeto

### Pré-requisitos
- Python 3.10+
- Node.js 18+

### Back-end

```bash
cd banckend
python -m venv venv

# Windows
venv\Scripts\activate
# Mac/Linux
source venv/bin/activate

pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser   # usuário de acesso ao painel
python manage.py runserver
```

A API fica disponível em `http://127.0.0.1:8000/api/`.

### Front-end

Em outro terminal:

```bash
cd frontend
npm install
npm run dev
```

- Tela da cliente: `http://localhost:5173`
- Painel da dona: `http://localhost:5173/admin`

## Rotas da API

| Método | Rota                                   | Descrição                                   | Acesso  |
|--------|----------------------------------------|---------------------------------------------|---------|
| GET    | `/api/servicos/`                       | Lista os serviços                           | Público |
| GET    | `/api/horarios-disponiveis/`           | Horários livres (`?data=&servico_id=`)      | Público |
| POST   | `/api/agendar/`                        | Cria um agendamento                         | Público |
| POST   | `/api/admin/login/`                    | Retorna o token de acesso                   | Público |
| GET/POST | `/api/admin/servicos/`               | Lista e cria serviços                       | Admin   |
| PATCH/DELETE | `/api/admin/servicos/<id>/`      | Edita e exclui um serviço                   | Admin   |
| GET    | `/api/admin/agendamentos/`             | Agenda do período (`?de=&ate=`)             | Admin   |
| DELETE | `/api/admin/agendamentos/<id>/`        | Cancela um agendamento                      | Admin   |

## Estrutura

```
BeautyFlow/
├── banckend/
│   ├── agendamentos/        # app principal: models, views, rotas e painel
│   └── core/                # configurações do Django
└── frontend/
    └── src/
        ├── admin/           # painel da dona do studio
        ├── components/      # calendário e tela de confirmação
        └── App.jsx          # tela de agendamento da cliente
```
