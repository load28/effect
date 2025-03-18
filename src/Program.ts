import { Context, Effect, Option } from "effect"

type User = {
  id: number
  name: string
}

class UserRepository extends Context.Tag("UserRepository")<
  UserRepository,
  {
    findById: (id: number) => Effect.Effect<User>
    findAll: () => Effect.Effect<Array<User>>
  }
>() {}

class UserService extends Context.Tag("UserService")<
  UserService,
  {
    getUser: (id: number) => Effect.Effect<User>
  }
>() {}

const userRepositoryLive = UserRepository.of({
  findById: (id) => Effect.succeed({ id, name: `User ${id}` }),
  findAll: () =>
    Effect.succeed([
      { id: 1, name: "User 1" },
      { id: 2, name: "User 2" }
    ])
})

const userServiceLive = UserService.of({
  getUser: (id) => Effect.succeed({ id, name: `User ${id}` })
})

const program = Effect.gen(function* () {
  const userRepository = yield* UserRepository
  const userService = yield* Effect.serviceOption(UserService)

  const user = Option.isNone(userService)
    ? yield* Effect.succeed({ id: 1, name: "Optional User" })
    : yield* userRepository.findById(1)
  console.log("userService", user)
  const user2 = yield* userRepository.findById(2)
  console.log("userRepository", user2)
})

Effect.runSync(
  program.pipe(
    Effect.provideService(UserRepository, userRepositoryLive),
    Effect.provideService(UserService, userServiceLive)
  )
)
