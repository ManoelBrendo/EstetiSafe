export const passwordPolicyHint =
  'A senha precisa ter pelo menos 1 letra, 2 caracteres especiais e 12 números, sem sequências como 1234, 4321 ou 1111.'

export interface PasswordPolicyStatus {
  lettersOk: boolean
  specialOk: boolean
  digitsOk: boolean
  sequenceOk: boolean
  isValid: boolean
}

function countMatches(value: unknown, expression: RegExp): number {
  return (String(value || '').match(expression) || []).length
}

export function hasForbiddenDigitSequence(value: unknown, size = 4): boolean {
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

export function getPasswordPolicyStatus(value = ''): PasswordPolicyStatus {
  const letters = countMatches(value, /[A-Za-z]/g)
  const special = countMatches(value, /[^A-Za-z0-9]/g)
  const digits = countMatches(value, /\d/g)
  const sequenceOk = !hasForbiddenDigitSequence(value)

  return {
    lettersOk: letters >= 1,
    specialOk: special >= 2,
    digitsOk: digits >= 12,
    sequenceOk,
    isValid: letters >= 1 && special >= 2 && digits >= 12 && sequenceOk,
  }
}
