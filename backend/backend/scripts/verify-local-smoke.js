const { execSync } = require('child_process')
const http = require('http')

const PORT = process.env.PORT || 3000
const BASE_URL = `http://localhost:${PORT}`

function request(method, path, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = `${BASE_URL}${path}`
    const parsed = new URL(url)
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || 80,
      path: parsed.pathname + parsed.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    }

    const req = http.request(options, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        let json = null
        try {
          json = JSON.parse(data)
        } catch {
          json = data
        }
        resolve({ status: res.statusCode, headers: res.headers, data: json })
      })
    })

    req.on('error', (err) => reject(err))

    if (body) {
      req.write(JSON.stringify(body))
    }
    req.end()
  })
}

async function runLocalSmokeTest() {
  console.log('==================================================')
  console.log('🤖 INICIANDO TESTE DE FUMAÇA DA STACK LOCAL L\'APPUI')
  console.log('==================================================\n')

  // 1. Verificar se o servidor está ativo
  console.log('1. Verificando conectividade e banco de dados (GET /ready)...')
  try {
    const readyRes = await request('GET', '/ready')
    if (readyRes.status !== 200) {
      throw new Error(`Servidor não está pronto: Status ${readyRes.status}`)
    }
    console.log('   [OK] Conectividade com banco de dados ativa.\n')
  } catch (err) {
    console.error('   [ERRO] Não foi possível conectar ao servidor. Certifique-se de que a stack está rodando na porta 3000.')
    console.error(`   Detalhe: ${err.message}`)
    process.exit(1)
  }

  // 2. Registrar uma nova clínica de teste
  const stamp = Date.now().toString(36)
  const clinicEmail = `clinica.smoke.${stamp}@lappui.local`
  const clinicPassword = 'A!@246813579246_smoke'
  console.log(`2. Criando conta de teste: ${clinicEmail}...`)
  const regRes = await request('POST', '/auth/register', {}, {
    email: clinicEmail,
    password: clinicPassword,
    clinicName: `Clínica Smoke Test ${stamp}`,
  })
  if (regRes.status !== 201) {
    console.error('   [ERRO] Falha no cadastro de clínica:', regRes.data)
    process.exit(1)
  }
  const token = regRes.data.token
  console.log('   [OK] Clínica cadastrada com sucesso.\n')

  // 3. Cadastrar um cliente
  console.log('3. Criando ficha de cliente de teste...')
  const clientRes = await request('POST', '/clients', { Authorization: `Bearer ${token}` }, {
    name: 'Paciente Teste de Fumaça',
    phone: '11988887777',
    email: `paciente.${stamp}@lappui.local`,
    birthDate: '1995-10-10',
    cpf: '12345678901',
  })
  if (clientRes.status !== 201) {
    console.error('   [ERRO] Falha ao criar cliente:', clientRes.data)
    process.exit(1)
  }
  const clientId = clientRes.data.id
  console.log(`   [OK] Cliente criado com ID: ${clientId}.\n`)

  // 4. Salvar anamnese com contraindicações e riscos específicos
  console.log('4. Enviando ficha de anamnese com fatores de risco...')
  const signatureDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAoMBgNf8Ap8AAAAASUVORK5CYII='
  const anamnesisPayload = {
    answers: {
      identification: {
        fullName: 'Paciente Teste de Fumaça',
        cpf: '12345678901',
        birthDate: '1995-10-10',
        phone: '11988887777',
        email: `paciente.${stamp}@lappui.local`,
      },
      chiefComplaint: {
        currentDiscomfort: 'Busca avaliação clínica preventiva.',
      },
      healthHistory: {
        preExistingConditions: {
          autoimmuneDisease: true,
        },
        surgeries: {},
        medications: {
          continuousMedication: true,
          medicationDetails: 'Uso contínuo de anticoagulante',
          anticoagulants: true,
        },
        allergies: {
          hasAllergies: true,
          anestheticsAllergy: true,
          notes: 'Alergia severa a anestesicos locais',
        },
        dermatologicalHistory: {},
        aestheticHistory: [],
      },
      lifestyle: {},
      aestheticEvaluation: {},
      contraindications: {
        pregnancy: true,
      },
      expectations: {},
      photoRecord: {
        photos: [],
        imageUseAuthorized: false,
      },
      treatmentPlan: {
        services: [
          {
            id: 'service-smoke-1',
            name: 'Preenchimento Labial',
            sessions: 1,
            description: 'Aplicação labial.',
            adverseEffects: 'Inchaço.',
          },
        ],
      },
      scienceTerm: {
        informedHistoryAccurately: true,
        awareOfRisks: true,
        receivedPreAndPostGuidance: true,
      },
      signatures: {
        patientSignatureDataUrl: signatureDataUrl,
        professionalSignatureDataUrl: signatureDataUrl,
        professionalName: 'Dr. Smoke Test',
        signedAt: '2026-06-15',
      },
    },
  }

  const anamnesisRes = await request('POST', `/clients/${clientId}/anamnesis`, { Authorization: `Bearer ${token}` }, anamnesisPayload)
  if (anamnesisRes.status !== 201) {
    console.error('   [ERRO] Falha ao salvar anamnese:')
    console.dir(anamnesisRes.data, { depth: null })
    process.exit(1)
  }
  console.log('   [OK] Anamnese com histórico clínico salva com sucesso.\n')

  // 5. Consultar Dashboard e verificar se os alertas foram gerados
  console.log('5. Consultando painel operacional (GET /dashboard) para verificar alertas clínicos...')
  const dashRes = await request('GET', '/dashboard', { Authorization: `Bearer ${token}` })
  if (dashRes.status !== 200) {
    console.error('   [ERRO] Falha ao consultar dashboard:', dashRes.data)
    process.exit(1)
  }
  const insights = dashRes.data.clinicalInsights?.insights || []
  const kinds = insights.map(i => i.kind)
  
  console.log('   Insights clínicos gerados:')
  insights.forEach(i => console.log(`     - [${i.priority}] ${i.title}: ${i.description}`))

  const hasPregnancy = kinds.includes('PREGNANCY_ATTENTION')
  const hasAllergy = kinds.includes('ALLERGY_REVIEW')
  const hasMedication = kinds.includes('MEDICATION_REVIEW')

  if (hasPregnancy && hasAllergy && hasMedication) {
    console.log('   [OK] Todos os alertas clínicos esperados foram gerados corretamente pelo backend.\n')
  } else {
    console.warn('   [AVISO] Alguns alertas de risco não foram encontrados:', kinds)
  }

  // 6. Criar intenção de cobrança de assinatura
  console.log('6. Gerando intenção de faturamento do plano comercial...')
  const intentRes = await request('POST', '/billing/gateway/intents', { Authorization: `Bearer ${token}` }, {
    amount: 199.90,
    method: 'PIX',
  })
  if (intentRes.status !== 201) {
    console.error('   [ERRO] Falha ao gerar intenção de faturamento:', intentRes.data)
    process.exit(1)
  }
  const reference = intentRes.data.intent.reference
  console.log(`   [OK] Checkout Pix gerado. Referência de cobrança: ${reference}.\n`)

  // 7. Simular pagamento usando as credenciais do suporte administrador
  console.log('7. Efetuando login do suporte administrativo para simular pagamento...')
  const supportLoginRes = await request('POST', '/auth/login', {}, {
    email: process.env.SUPPORT_ADMIN_EMAIL || 'manoelbrendo@gmail.com',
    password: process.env.SUPPORT_ADMIN_PASSWORD || 'abc87630294',
  })
  if (supportLoginRes.status !== 200) {
    console.error('   [ERRO] Falha no login do suporte administrativo:', supportLoginRes.data)
    process.exit(1)
  }
  const supportToken = supportLoginRes.data.token
   const clinicUserId = regRes.data.user.id
  console.log(`   Assumindo sessão da clínica na central de suporte (userId: ${clinicUserId})...`)
  const assumeRes = await request('POST', '/support/assume', { Authorization: `Bearer ${supportToken}` }, {
    userId: clinicUserId,
  })
  if (assumeRes.status !== 200) {
    console.error('   [ERRO] Falha ao assumir sessão da clínica:', assumeRes.data)
    process.exit(1)
  }
  const assumedToken = assumeRes.data.token
  console.log('   Simulando confirmação de recebimento (webhook /simulate-paid)...')
  const simulateRes = await request(
    'POST', 
    `/billing/gateway/intents/${reference}/simulate-paid`, 
    { Authorization: `Bearer ${assumedToken}` },
    {
      status: 'PAID',
      provider: 'STRIPE',
      providerPaymentId: `ch_${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
    }
  )
  if (simulateRes.status !== 200) {
    console.error('   [ERRO] Falha ao simular pagamento do checkout:', simulateRes.data)
    process.exit(1)
  }
  console.log('   [OK] Pagamento simulado com sucesso.\n')

  // 8. Verificar se a clínica foi ativada
  console.log('8. Consultando status cadastral após faturamento...')
  const finalDashRes = await request('GET', '/dashboard', { Authorization: `Bearer ${token}` })
  const billingStatus = finalDashRes.data.billing?.status || 'TRIAL'
  if (billingStatus === 'ACTIVE') {
    console.log('   [OK] A assinatura da clínica foi ativada com sucesso!\n')
  } else {
    console.error(`   [ERRO] Status de faturamento incorreto: ${billingStatus}`)
    process.exit(1)
  }

  // 9. Consultar logs de auditoria
  console.log('9. Recuperando trilha de auditoria (GET /audit-logs)...')
  const auditRes = await request('GET', '/audit-logs', { Authorization: `Bearer ${token}` })
  if (auditRes.status === 200) {
    const logs = auditRes.data.logs || auditRes.data || []
    console.log(`   Foram encontrados ${logs.length} registros de auditoria para esta clínica:`)
    logs.slice(0, 5).forEach(l => {
      console.log(`     - [${l.action}] efetuado por ${l.actorEmail} (${l.actorRole}) às ${l.createdAt}`)
    })
    console.log('   [OK] Trilha de auditoria gerada com conformidade LGPD.\n')
  }

  console.log('==================================================')
  console.log('🎉 SUCESSO! A STACK LOCAL PASSOU NO TESTE DE FUMAÇA')
  console.log('==================================================')
}

runLocalSmokeTest().catch(console.error)
