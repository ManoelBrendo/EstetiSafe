function hasSupportBillingControl(subject) {
  const target = subject?.user ? subject.user : subject
  return Boolean(target?.support || target?.impersonatedBySupport)
}

module.exports = {
  hasSupportBillingControl,
}
