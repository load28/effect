import { Context, Effect } from "effect"

type User = {
  id: number
  name: string
}

class UserRepositoryError extends Error {
  readonly _tag = "UserRepositoryError"
  constructor(message: string) {
    super(`UserRepositoryError: ${message}`)
    this.name = "UserRepositoryError"
  }

  static readonly NotFound = (id: number) => {
    return new UserRepositoryError(`User with id ${id} not found`)
  }
}

class LocalStorageError extends Error {
  readonly _tag = "LocalStorageError"
  constructor(message: string) {
    super(`LocalStorageError: ${message}`)
    this.name = "LocalStorageError"
  }

  static readonly parseError = (error: unknown) => {
    if (error instanceof Error) {
      return new LocalStorageError(error.message)
    }

    return new LocalStorageError("Unknown error")
  }

  static readonly stringifyError = (error: unknown) => {
    if (error instanceof Error) {
      return new LocalStorageError(error.message)
    }

    return new LocalStorageError("Unknown error")
  }

  static readonly NotFound = (key: string) => {
    return new LocalStorageError(`LocalStorage key ${key} not found`)
  }
}

class UserRepository extends Context.Tag("UserRepository")<
  UserRepository,
  {
    findById: (id: number) => Effect.Effect<User | undefined, UserRepositoryError, never>
    findAll: () => Effect.Effect<Array<User>, UserRepositoryError, never>
  }
>() {}

const users: Array<User> = [
  { id: 1, name: "User 1" },
  { id: 2, name: "User 2" }
]

class LocalStorageService extends Context.Tag("LocalStorageService")<
  LocalStorageService,
  {
    getItem<T>(key: string): Effect.Effect<T, LocalStorageError>
    setItem<T>(key: string, value: T): Effect.Effect<void, LocalStorageError>
    removeItem(key: string): Effect.Effect<void, LocalStorageError>
  }
>() {}

const localStorageServiceLive = LocalStorageService.of({
  getItem: <T>(key: string) =>
    Effect.try<T, LocalStorageError>({
      try: () => {
        const item = localStorage.getItem(key)
        if (!item) {
          throw LocalStorageError.NotFound(key)
        }

        return JSON.parse(item) as T
      },
      catch: (error) => LocalStorageError.parseError(error)
    }),
  setItem: <T>(key: string, value: T) =>
    Effect.try<void, LocalStorageError>({
      try: () => {
        const stringifiedValue = JSON.stringify(value)
        localStorage.setItem(key, stringifiedValue)
      },
      catch: (error) => LocalStorageError.stringifyError(error)
    }),
  removeItem: (key: string) =>
    Effect.try<void, LocalStorageError>({
      try: () => localStorage.removeItem(key),
      catch: (error) => LocalStorageError.parseError(error)
    })
})

const userInmemoryRepositoryLive = UserRepository.of({
  findAll: () => Effect.succeed(users),
  findById: (id) => {
    const user = users.find((user) => user.id === id)
    return Effect.succeed(user)
  }
})

const userLocalStorageRepositoryLive = UserRepository.of({
  findById: (id) => {
    return Effect.gen(function* () {
      const localStorageService = yield* LocalStorageService
      const users = yield* localStorageService
        .getItem<Array<User>>("users")
        .pipe(Effect.catchAll(() => Effect.succeed([])))

      return users.find((user) => user.id === id)
    }).pipe(Effect.provideService(LocalStorageService, localStorageServiceLive))
  },
  findAll: () => {
    return Effect.gen(function* () {
      const localStorageService = yield* LocalStorageService
      const users = yield* localStorageService
        .getItem<Array<User>>("users")
        .pipe(Effect.catchAll(() => Effect.succeed([])))

      return users
    }).pipe(Effect.provideService(LocalStorageService, localStorageServiceLive))
  }
})

const main = Effect.gen(function* () {
  const userRepository = yield* UserRepository

  const userWithError = yield* userRepository.findById(1)
  const user2 = yield* userRepository.findById(2)
  const all = yield* userRepository.findAll()

  console.log("user1", userWithError)
  console.log("user2", user2)
  console.log("all", all)
})

Effect.runSync(main.pipe(Effect.provideService(UserRepository, userLocalStorageRepositoryLive)))
