export const passwordPolicyHint =
  'A senha precisa ter pelo menos 1 letra maiúscula, 1 letra minúscula, 1 caractere especial e 8 números, sem sequências consecutivas (como 1234, abcd, 4321, dcba, 1111 ou aaaa).'

export interface PasswordPolicyStatus {
  hasUppercase: boolean
  hasLowercase: boolean
  hasSpecial: boolean
  has8Digits: boolean
  sequenceOk: boolean
  isValid: boolean
  score: number // Number of met criteria (0 to 5)
}

function countMatches(value: unknown, expression: RegExp): number {
  return (String(value || '').match(expression) || []).length
}

export function hasForbiddenDigitSequence(value: unknown, size = 4): boolean {
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

export function getPasswordPolicyStatus(value = ''): PasswordPolicyStatus {
  const hasUppercase = countMatches(value, /[A-Z]/g) >= 1
  const hasLowercase = countMatches(value, /[a-z]/g) >= 1
  const hasSpecial = countMatches(value, /[^A-Za-z0-9]/g) >= 1
  const has8Digits = countMatches(value, /\d/g) >= 8
  const sequenceOk = !hasForbiddenDigitSequence(value)

  let score = 0
  if (hasUppercase) score += 1
  if (hasLowercase) score += 1
  if (hasSpecial) score += 1
  if (has8Digits) score += 1
  if (sequenceOk && value.length > 0) score += 1

  return {
    hasUppercase,
    hasLowercase,
    hasSpecial,
    has8Digits,
    sequenceOk,
    isValid: hasUppercase && hasLowercase && hasSpecial && has8Digits && sequenceOk,
    score,
  }
}

export function generateStrongPassword(): string {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const lowercase = 'abcdefghijklmnopqrstuvwxyz'
  const digits = '0123456789'
  const special = '!@#$%&*()_+[]{}?:'

  const selectRandom = (str: string, count: number) => {
    let res = ''
    for (let i = 0; i < count; i++) {
      res += str[Math.floor(Math.random() * str.length)]
    }
    return res
  }

  for (let attempt = 0; attempt < 100; attempt++) {
    const chars = [
      selectRandom(uppercase, 1),
      selectRandom(lowercase, 2),
      selectRandom(special, 1),
      selectRandom(digits, 8)
    ]
    const shuffled = chars.join('').split('').sort(() => Math.random() - 0.5).join('')
    if (!hasForbiddenDigitSequence(shuffled)) {
      return shuffled
    }
  }

  return 'A!@246813579246'
}
