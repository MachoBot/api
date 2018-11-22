import { Application } from 'express'
import { getRepository, Like } from 'typeorm'
import { User, UserLevel, UserBalance, UserLinks, UserSteamLinks, UserGithubLinks } from 'machobot-database'
import * as config from '../config/config'
import * as fs from 'fs'
import * as jwt from 'jsonwebtoken'

export async function UserRoutes (app: Application) {
  const userRepository = getRepository(User)
  const userLevelRepository = getRepository(UserLevel)
  const userBalanceRepository = getRepository(UserBalance)
  const userLinksRepository = getRepository(UserLinks)
  const userSteamLinksRepository = getRepository(UserSteamLinks)
  const userGithubLinksRepository = getRepository(UserGithubLinks)

  app.get('/api/users', async (req, res) => {
    const skip = req.query.skip ? req.query.skip : 0
    const take = randomIntFromInterval(40, 50)
    const users = await userRepository.find({ take, skip })

    res.send(users)
  })

  app.get('/api/users/:id', async (req, res) => {
    const user = await userRepository.findOne(req.params.id, { relations: [ 'balance', 'level' ] })

    res.send(user)
  })

  app.get('/api/users/:id/level', async (req, res) => {
    const user = await userRepository.findOne(req.params.id, { relations: [ 'level' ] })

    if (!user) {
      return res.send('')
    }

    res.send(user.level)
  })

  app.get('/api/users/:id/balance', async (req, res) => {
    const user = await userRepository.findOne(req.params.id, { relations: [ 'balance' ] })

    if (!user) {
      return res.send('')
    }

    res.send(user.balance)
  })

  app.get('/api/users/:id/links', async (req, res) => {
    const user = await userRepository.findOne(req.params.id, { relations: [ 'links' ] })

    if (!user) {
      return res.send('')
    }

    res.send(user.links)
  })

  app.get('/api/users/:id/playlists', async (req, res) => {
    const user = await userRepository.findOne(req.params.id, { relations: [ 'playlists' ] })

    if (!user) {
      return res.send('')
    }

    res.send(user.playlists)
  })

  app.post('/api/users&code=:code', async (req, res) => {
    const code = req.params.code
    const userReq = req.body

    if (code !== config.code) {
      res.statusCode = 401
      return res.send({ error: 'Invalid code.' })
    }

    const user = new User(userReq)

    if (await userRepository.findOne(user.id)) {
      res.statusCode = 409
      return res.send({ error: 'already_exists' })
    }

    user.level = new UserLevel()
    user.balance = new UserBalance()
    user.links = new UserLinks()

    const response = await userRepository.save(user).catch(error => {
      console.log(error)
      return error
    })

    res.statusCode = 201
    res.send(response)
  })

  app.put('/api/users/:id&code=:code', async (req, res) => {
    const code = req.params.code
    const user: User = req.body

    if (code !== config.code) {
      res.statusCode = 401
      return res.send({ error: 'Invalid code.' })
    }

    const response = await userRepository.save(user).catch(error => {
      console.log(error)
      return error
    })

    res.send(response)
  })

  app.delete('/api/users/:id&code=:code', async (req, res) => {
    const code = req.params.code

    if (code !== config.code) {
      res.statusCode = 401
      return res.send({ error: 'Invalid code.' })
    }

    let responses: any[] = []

    const user = await userRepository.findOne(req.params.id, { relations: [ 'balance', 'level', 'links' ] }).catch(error => {
      console.log(error)
      responses.push(error)
    })

    if (!user) {
      return res.send(responses[0])
    }

    await userRepository.delete({ id: user.id }).catch(error => {
      console.log(error)
      responses.push(error)
    })

    await userBalanceRepository.delete({ id: user.balance.id }).catch(error => {
      console.log(error)
      responses.push(error)
    })

    await userLevelRepository.delete({ id: user.level.id }).catch(error => {
      console.log(error)
      responses.push(error)
    })

    await userLinksRepository.delete({ id: user.links.id }).catch(error => {
      console.log(error)
      responses.push(error)
    })

    res.send(responses)
  })

  app.put('/api/users/:id/balance&code=:code', async (req, res) => {
    const code = req.params.code
    const balance: UserBalance = req.body

    if (code !== config.code) {
      res.statusCode = 401
      return res.send({ error: 'Invalid code.' })
    }

    const response = await userBalanceRepository.save(balance).catch(error => {
      console.log(error)
      return error
    })

    res.send(response)
  })

  app.put('/api/users/:id/level&code=:code', async (req, res) => {
    const code = req.params.code
    const level: UserLevel = req.body

    if (code !== config.code) {
      res.statusCode = 401
      return res.send({ error: 'Invalid code.' })
    }

    const response = await userLevelRepository.save(level).catch(error => {
      console.log(error)
      return error
    })

    res.send(response)
  })

  app.put('/api/users/:id/links&code=:code', async (req, res) => {
    const code = req.params.code
    const links: UserLinks = req.body

    if (code !== config.code) {
      res.statusCode = 401
      return res.send({ error: 'Invalid code.' })
    }

    const response = await userLinksRepository.save(links).catch(error => {
      console.log(error)
      return error
    })

    res.send(response)
  })

  app.post('/api/steamauth/link', async (req, res) => {
    const steamId: string = req.query.steamId
    const discordId: string = req.query.discordId
    const apiToken: string = req.query.jwt
    const publicRsa = fs.readFileSync('./src/config/id_rsa.pub.pem')
    let decodedApiToken

    try {
      decodedApiToken = jwt.verify(apiToken, publicRsa)
    } catch (err) {
      return res.send({ error: 'Invalid JWT.' })
    }

    if (decodedApiToken.userId !== discordId) {
      console.log(`Tried to link to another Discord account.\nDifference: ${decodedApiToken.userId} (length of ${
        decodedApiToken.userId.length}) != ${discordId} (length of ${discordId.length})`)

      return res.send({ error: 'Invalid JWT.' })
    }

    const user = await userRepository.findOne(discordId, { relations: [ 'links' ], select: [ 'accessToken', 'links' ] })

    if (!user) {
      console.log('User doesn\'t exist.')
      return res.send({ error: 'User doesn\'t exist.' })
    }

    const accessToken = user.accessToken

    if (decodedApiToken.accessToken !== accessToken) {
      console.log(`Access Token was incorrect\n${decodedApiToken.accessToken} !== ${accessToken}`)
      return res.send({ error: 'Invalid JWT.' })
    }

    const same = await userSteamLinksRepository.findOne({ where: { userId: steamId } })

    if (same) {
      console.log('Account already linked.')
      return res.send({ error: 'Account is already linked to another user.' })
    }

    const links = await userLinksRepository.findOne({ where: { user: { id: discordId } }, relations: [ 'steam' ] })
    links.steam.userId = steamId

    await userLinksRepository.save(links)

    return res.send('Successful')
  })

  app.post('/api/githubauth/link', async (req, res) => {
    const githubId: string = req.query.githubId === '' ? null : req.query.githubId
    const discordId: string = req.query.discordId
    const apiToken: string = req.query.jwt
    const publicRsa = fs.readFileSync('./src/config/id_rsa.pub.pem')
    let decodedApiToken

    try {
      decodedApiToken = jwt.verify(apiToken, publicRsa)
    } catch (err) {
      return res.send({ error: 'token' })
    }

    if (decodedApiToken.userId !== discordId) {
      return res.send({ error: 'token' })
    }

    const user = await userRepository.findOne(discordId, { relations: [ 'links' ], select: [ 'accessToken', 'links' ] })

    if (!user) {
      return res.send({ error: 'user_not_found' })
    }

    const accessToken = user.accessToken

    if (decodedApiToken.accessToken !== accessToken) {
      return res.send({ error: 'token' })
    }

    const same = await userGithubLinksRepository.findOne({ where: { username: githubId } })

    if (same) {
      console.log('Account already linked.')
      return res.send({ error: 'Account is already linked to another user.' })
    }

    user.links.github.username = githubId
    await userRepository.save(user)

    console.log('Successful')
    return res.send('Successful')
  })
}

function randomIntFromInterval (min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1) + min)
}
