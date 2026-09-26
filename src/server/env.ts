import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.url(),
  DATABASE_URL: z.string().startsWith('postgresql://'),
  ADMIN_EMAIL: z.email(),
  ADMIN_PASSWORD_HASH: z.string().startsWith('$argon2'),
  SESSION_PASSWORD: z.string().min(32),
  SUMOPOD_ENV: z.enum(['sandbox', 'production']),
  SUMOPOD_API_BASE_URL: z.url(),
  SUMOPOD_API_KEY: z.string().default(''),
  SUMOPOD_WEBHOOK_SECRET: z.string().default(''),
  SUMOPOD_ALLOWED_PAYMENT_HOSTS: z.string().min(1),
  QR_BROWSER_ENABLED: z.enum(['true', 'false']).default('true').transform((value) => value === 'true'),
  QR_BROWSER_CHANNEL: z.string().default('chrome'),
  QR_BROWSER_EXECUTABLE_PATH: z.string().optional(),
  API_KEY_PEPPER: z.string().min(32),
  MIN_PAYMENT_AMOUNT: z.coerce.number().int().positive().default(10000),
  MAX_PAYMENT_AMOUNT: z.coerce.number().int().positive().default(10000000),
  TRUSTED_PROXY_HEADER: z.string().trim().default('cf-connecting-ip'),
}).superRefine((env, ctx) => {
  if (env.MIN_PAYMENT_AMOUNT > env.MAX_PAYMENT_AMOUNT) {
    ctx.addIssue({ code: 'custom', path: ['MIN_PAYMENT_AMOUNT'], message: 'MIN_PAYMENT_AMOUNT tidak boleh melebihi MAX_PAYMENT_AMOUNT' })
  }
  if (env.NODE_ENV === 'production') {
    if (!env.SUMOPOD_API_KEY) ctx.addIssue({ code: 'custom', path: ['SUMOPOD_API_KEY'], message: 'Required in production' })
    if (!env.SUMOPOD_WEBHOOK_SECRET.startsWith('whsec_')) ctx.addIssue({ code: 'custom', path: ['SUMOPOD_WEBHOOK_SECRET'], message: 'Required in production' })
    if (new URL(env.APP_URL).protocol !== 'https:') ctx.addIssue({ code: 'custom', path: ['APP_URL'], message: 'Production requires an HTTPS APP_URL' })
  }
  if (env.SUMOPOD_ENV === 'production' && env.SUMOPOD_API_BASE_URL.includes('sandbox')) {
    ctx.addIssue({ code: 'custom', path: ['SUMOPOD_API_BASE_URL'], message: 'Production cannot use Sandbox API' })
  }
})

export function getEnv() {
  return schema.parse(process.env)
}
