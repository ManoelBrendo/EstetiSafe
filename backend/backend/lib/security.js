const crypto = require('crypto')

const passwordPolicyMessage = 'A senha precisa ter pelo menos 1 letra maiúscula, 1 letra minúscula, 1 caractere especial e 8 números, sem sequências como 1234, abcd, 4321, dcba, 1111 ou aaaa.'

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
  const input = String(value || '')
  if (input.length < size) {
    return false
  }

  for (let index = 0; index <= input.length - size; index += 1) {
    let isDigitSeq = true
    let isLetterSeq = true

    for (let offset = 0; offset < size; offset += 1) {
      const char = input[index + offset]
      if (char < '0' || char > '9') isDigitSeq = false
      if (!/[A-Za-z]/.test(char)) isLetterSeq = false
    }

    if (isDigitSeq) {
      let ascending = true
      let descending = true
      let repeated = true

      for (let offset = 1; offset < size; offset += 1) {
        const previous = Number(input[index + offset - 1])
        const current = Number(input[index + offset])

        if (current !== previous + 1) ascending = false
        if (current !== previous - 1) descending = false
        if (current !== previous) repeated = false
      }

      if (ascending || descending || repeated) {
        return true
      }
    }

    if (isLetterSeq) {
      let ascending = true
      let descending = true
      let repeated = true

      for (let offset = 1; offset < size; offset += 1) {
        const previous = input[index + offset - 1].toLowerCase().charCodeAt(0)
        const current = input[index + offset].toLowerCase().charCodeAt(0)

        if (current !== previous + 1) ascending = false
        if (current !== previous - 1) descending = false
        if (current !== previous) repeated = false
      }

      if (ascending || descending || repeated) {
        return true
      }
    }
  }

  return false
}

function passwordMeetsPolicy(value = '') {
  const input = String(value || '')
  const uppercaseCount = countMatches(input, /[A-Z]/g)
  const lowercaseCount = countMatches(input, /[a-z]/g)
  const specialCount = countMatches(input, /[^A-Za-z0-9]/g)
  const digitCount = countMatches(input, /\d/g)

  return uppercaseCount >= 1 &&
         lowercaseCount >= 1 &&
         specialCount >= 1 &&
         digitCount >= 8 &&
         !hasForbiddenDigitSequence(input)
}

module.exports = {
  hasForbiddenDigitSequence,
  passwordMeetsPolicy,
  passwordPolicyMessage,
  safeEqualText,
}
