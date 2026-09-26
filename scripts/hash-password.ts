import { hash } from 'argon2'

const password = process.argv[2]
if (!password || password.length < 8) {
  console.error('Masukkan password minimal 8 karakter: npm run admin:hash -- "password"')
  process.exit(1)
}

console.log(await hash(password))
