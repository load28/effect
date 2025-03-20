import { Context, Effect, Layer } from "effect"

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

class LocalStorageService extends Context.Tag("LocalStorageService")<
  LocalStorageService,
  {
    getItem<T>(key: string): Effect.Effect<T | undefined, LocalStorageError>
    setItem<T>(key: string, value: T): Effect.Effect<void, LocalStorageError>
    removeItem(key: string): Effect.Effect<void, LocalStorageError>
  }
>() {}

class UserRepository extends Context.Tag("UserRepository")<
  UserRepository,
  {
    update: (user: User) => Effect.Effect<void, UserRepositoryError>
    findById: (id: number) => Effect.Effect<User | undefined, UserRepositoryError>
    findAll: () => Effect.Effect<Array<User>, UserRepositoryError>
  }
>() {}

const localStorageServiceLive = LocalStorageService.of({
  getItem: <T>(key: string) =>
    Effect.try<T | undefined, LocalStorageError>({
      try: () => {
        const item = localStorage.getItem(key)
        if (!item) {
          return undefined
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

const userLocalStorageRepository = Effect.gen(function* () {
  const localStorageService = yield* LocalStorageService

  return UserRepository.of({
    findById: (id: number) => {
      return Effect.gen(function* () {
        return yield* localStorageService.getItem<Array<User>>("users").pipe(
          Effect.map((users) => users || []),
          Effect.catchAll(() => Effect.succeed<Array<User>>([])),
          Effect.map((users) => users.find((user) => user.id === id))
        )
      })
    },
    findAll: () => {
      return Effect.gen(function* () {
        return yield* localStorageService.getItem<Array<User>>("users").pipe(
          Effect.map((users) => users || []),
          Effect.catchAll(() => Effect.succeed<Array<User>>([]))
        )
      })
    },
    update: (user: User) => {
      return Effect.gen(function* () {
        return yield* localStorageService.getItem<Array<User>>("users").pipe(
          Effect.map((users) => users || []),
          Effect.map((users) => {
            const index = users.findIndex((u) => u.id === user.id)
            if (index === -1) {
              return users
            }

            return [...users.slice(0, index), { ...user }, ...users.slice(index + 1)]
          }),
          Effect.flatMap((users) => localStorageService.setItem("users", users)),
          Effect.catchAll(() => Effect.succeed(void 0))
        )
      })
    }
  })
})

const users: Array<User> = [
  { id: 1, name: "User 1" },
  { id: 2, name: "User 2" }
]

const inMemoryUserRepository = Effect.gen(function* () {
  return UserRepository.of({
    findById: (id: number) => Effect.succeed(users.find((user) => user.id === id)),
    findAll: () => Effect.succeed(users),
    update: (user: User) => Effect.succeed((users[users.findIndex((u) => u.id === user.id)] = user))
  })
})

const localStorageLayer = Layer.succeed(LocalStorageService, localStorageServiceLive)
const userLocalStorageRepositoryLayer = Layer.effect(
  UserRepository,
  userLocalStorageRepository.pipe(Effect.provide(localStorageLayer))
)
const inMemoryUserRepositoryLayer = Layer.effect(UserRepository, inMemoryUserRepository)

const selectUserRepositoryLayer = (isDevelopment: boolean) =>
  isDevelopment ? inMemoryUserRepositoryLayer : userLocalStorageRepositoryLayer

const main = Effect.gen(function* () {
  const userRepository = yield* UserRepository

  const userWithError = yield* userRepository.findById(1)
  const user2 = yield* userRepository.findById(2)
  const all = yield* userRepository.findAll()

  console.log("user1", userWithError)
  console.log("user2", user2)
  console.log("all", all)
})

Effect.runSync(main.pipe(Effect.provide(selectUserRepositoryLayer(process.env.BUN_ENV === "development"))))
