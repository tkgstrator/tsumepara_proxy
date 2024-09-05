import { Format } from '@/enums/format'
import { HTTPMethod } from '@/enums/method'
import type { Bindings } from '@/utils/bindings'
import { TsumeObject, TsumeParser, TsumeText } from '@/utils/parser'
import { OpenAPIHono as Hono, createRoute, z } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { JSX } from 'hono/jsx/jsx-runtime'
import { ssgParams } from 'hono/ssg'
import { exportCSA, exportJKF, exportJKFString, exportKI2, exportKIF } from 'tsshogi'

export const app = new Hono<{ Bindings: Bindings }>()

const get_tsume_text = async (c: Context, tsume_id: number): Promise<string> => {
  const url: URL = new URL(`tsp/works/getWorkInfo/${tsume_id}`, 'https://aws.tumepara.com')
  const params = new URLSearchParams()
  params.append('session_key', c.env.SESSION_KEY)
  params.append('game_id', '2')
  return decodeURIComponent(
    await (
      await fetch(url.href, {
        method: HTTPMethod.POST,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
      })
    ).text()
  )
}

app.openapi(
  createRoute({
    method: HTTPMethod.GET,
    path: '/{tsume_id}',
    tags: ['棋譜'],
    summary: '詰将棋',
    // middleware: [cache({ cacheName: 'jsa_mobile_proxy/kif', cacheControl: 'public, max-age=86400' })],
    request: {
      params: z.object({
        tsume_id: z.string().pipe(z.coerce.number()).openapi({
          type: 'integer',
          default: '0',
          description: '詰将棋ID'
        })
      }),
      query: z.object({
        format: z.nativeEnum(Format).optional().openapi({
          default: Format.KIF,
          description: '棋譜形式'
        })
      })
    },
    responses: {
      200: {
        type: 'text/plain',
        description: '棋譜データ'
      }
    }
  }),
  async (c) => {
    const { tsume_id } = c.req.valid('param')
    const { format } = c.req.valid('query')
    const object: TsumeObject = TsumeObject.parse(await get_tsume_text(c, tsume_id))
    console.log(object.record.metadata)
    switch (format) {
      case Format.KIF:
        return c.text(exportKIF(object.record))
      case Format.CSA:
        return c.text(
          exportCSA(object.record, {
            v3: {
              encoding: 'UTF-8'
            }
          })
        )
      case Format.KI2:
        return c.text(exportKI2(object.record, {}))
      case Format.SFEN:
        return c.text(object.record.sfen)
      case Format.JKF:
        return c.text(exportJKFString(object.record))
      default:
        return c.text(exportKIF(object.record))
    }
  }
)
