class Container {
  constructor() {
    this.instances = new Map()
    this.factories = new Map()
  }

  registerInstance(name, instance) {
    this.instances.set(name, instance)
    return this
  }

  registerFactory(name, factory) {
    this.factories.set(name, factory)
    return this
  }

  resolve(name) {
    if (this.instances.has(name)) {
      return this.instances.get(name)
    }

    if (this.factories.has(name)) {
      const factory = this.factories.get(name)
      const instance = factory(this)
      this.instances.set(name, instance)
      return instance
    }

    throw new Error(`Dependency '${name}' not registered in IoC container.`)
  }
}

module.exports = {
  Container,
}
