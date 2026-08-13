/**
 * Funções utilitárias de mascaramento de dados sensíveis para conformidade com a LGPD.
 */

function maskCpf(cpf) {
  if (!cpf) return ''
  const clean = String(cpf).replace(/\D/g, '')
  if (clean.length !== 11) {
    return '***.***.***-**'
  }
  // Exemplo: 123.456.789-01 -> ***.***.789-**
  return `***.***.${clean.slice(6, 9)}-**`
}

function maskPhone(phone) {
  if (!phone) return ''
  const clean = String(phone).replace(/\D/g, '')
  if (clean.length === 11) {
    // Celular: 11999998888 -> (11) 9****-8888
    return `(${clean.slice(0, 2)}) 9****-${clean.slice(7)}`
  } else if (clean.length === 10) {
    // Fixo: 1133334444 -> (11) ****-4444
    return `(${clean.slice(0, 2)}) ****-${clean.slice(6)}`
  }
  // Fallback se não for padrão
  return '(**) *****-****'
}

module.exports = {
  maskCpf,
  maskPhone,
}
