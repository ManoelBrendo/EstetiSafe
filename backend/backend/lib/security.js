const crypto = require('crypto')

const passwordPolicyMessage = 'A senha precisa ter pelo menos 1 letra, 2 caracteres especiais e 12 números, sem sequências como 1234, 4321 ou 1111.'

function safeEqualText(left, right) {
  const leftBuffer = Buffer.from(String(left || ''))
  const rightBuffer = Buffer.from(String(right || ''))

  if (leftBuffer.length !== rightBuffer.length) {
    return false
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

function countMatches(value, expression) {
  return (String(value || '').match(expression) || []).length
}

function hasForbiddenDigitSequence(value, size = 4) {
  const digits = String(value || '').replace(/\D/g, '')

  if (digits.length < size) {
    return false
  }

  for (let index = 0; index <= digits.length - size; index += 1) {
    let ascending = true
    let descending = true
    let repeated = true

    for (let offset = 1; offset < size; offset += 1) {
      const previous = Number(digits[index + offset - 1])
      const current = Number(digits[index + offset])

      if (current !== previous + 1) ascending = false
      if (current !== previous - 1) descending = false
      if (current !== previous) repeated = false
    }

    if (ascending || descending || repeated) {
      return true
    }
  }

  return false
}

function passwordMeetsPolicy(value = '') {
  const input = String(value || '')
  const letterCount = countMatches(input, /[A-Za-z]/g)
  const specialCount = countMatches(input, /[^A-Za-z0-9]/g)
  const digitCount = countMatches(input, /\d/g)

  return letterCount >= 1 && specialCount >= 2 && digitCount >= 12 && !hasForbiddenDigitSequence(input)
}

module.exports = {
  hasForbiddenDigitSequence,
  passwordMeetsPolicy,
  passwordPolicyMessage,
  safeEqualText,
}
