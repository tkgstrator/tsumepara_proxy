import { Color } from '@/enums/color'
import { Piece } from '@/enums/piece'
import { z } from '@hono/zod-openapi'
import dayjs from 'dayjs'
import { HTTPException } from 'hono/http-exception'
import _ from 'lodash'
import { type Record, RecordMetadataKey, importCSA } from 'tsshogi'

export const Square = z.preprocess(
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  (input: any) => {
    const { value, index } = input
    const [x, y, color, is_promoted] = (value as string).split('').map((value: string) => Number.parseInt(value))
    return {
      piece: (() => {
        if (index < 18) return Piece.FU
        if (index < 22) return Piece.KY
        if (index < 26) return Piece.KE
        if (index < 30) return Piece.GI
        if (index < 34) return Piece.KI
        if (index < 36) return Piece.HI
        if (index < 38) return Piece.KA
        return Piece.OU
      })(),
      color: color === 0 ? Color.BLACK : Color.WHITE,
      x: x,
      y: y,
      is_promoted: is_promoted === 2
    }
  },
  z
    .object({
      piece: z.nativeEnum(Piece),
      color: z.nativeEnum(Color),
      x: z.number(),
      y: z.number(),
      is_promoted: z.boolean()
    })
    .transform((object) => {
      return {
        ...object,
        get csa(): string {
          const piece: Piece = !object.is_promoted
            ? object.piece
            : (() => {
                switch (object.piece) {
                  case Piece.FU:
                    return Piece.TO
                  case Piece.KY:
                    return Piece.NY
                  case Piece.KE:
                    return Piece.NK
                  case Piece.GI:
                    return Piece.NG
                  case Piece.KA:
                    return Piece.UM
                  case Piece.HI:
                    return Piece.RY
                  default:
                    return object.piece
                }
              })()
          return `${object.color === Color.BLACK ? '+' : '-'}${piece}`
        }
      }
    })
)

export type Square = z.infer<typeof Square>

export const TsumeObject = z.preprocess(
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  (query: any) => {
    return Object.fromEntries(
      new Map(
        (query as string)
          .split('&')
          .map((query) => query.split('='))
          .map(([key, value]) => [key, value])
      )
    )
  },
  z
    .object({
      d: z.string().pipe(z.coerce.number()),
      workid: z.string().pipe(z.coerce.number()),
      csv: z.string(),
      hint: z.string(),
      answercsv: z.string(),
      title: z.string(),
      authorname: z.string(),
      progresscnt: z.string().pipe(z.coerce.number()),
      workupdate: z.string().transform((date) => dayjs(date, 'YYYY/MM/DD[HH:mm:ss]').toDate()),
      point: z.string().pipe(z.coerce.number()),
      level: z.string().pipe(z.coerce.number())
    })
    .transform((object) => {
      return {
        ...object,
        // get pieces(): string[] {
        //   return object.csv.split('_').filter((value) => value.length > 0)
        // },
        get pieces(): Square[] {
          const pieces = object.csv.split('_').filter((value) => value.length > 0)
          return pieces.map((value, index) => Square.parse({ value: value, index: index }))
        },
        get record(): Record {
          const pieces: Square[] = object.csv
            .split('_')
            .filter((value) => value.length > 0)
            .map((value, index) => Square.parse({ value: value, index: index }))
          const board: string[] = [1, 2, 3, 4, 5, 6, 7, 8, 9]
            .map((y) => {
              return [1, 2, 3, 4, 5, 6, 7, 8, 9].reverse().map((x) => {
                const square: Square | undefined = pieces.find((square) => square.x === x && square.y === y)
                return square === undefined ? ' * ' : square.csa
              })
            })
            .map((x, index) => [`P${index + 1}`].concat(x).join(''))
          const hands: string[] = [Color.BLACK, Color.WHITE].map((color) =>
            [`P${color === Color.BLACK ? '+' : '-'}`]
              .concat(
                pieces
                  .filter((square) => square.color === color && square.x === 0 && square.y === 0)
                  .map((square) => `00${square.piece}`)
              )
              .join('')
          )
          const record: Record | Error = importCSA([hands, board].flat().join('\n'))
          if (record instanceof Error) {
            throw new HTTPException(500, { message: 'CSA形式の棋譜に変換できませんでした' })
          }
          record.metadata.setStandardMetadata(
            RecordMetadataKey.PUBLISHED_AT,
            dayjs(object.workupdate).format('YYYY/MM/DD HH:mm:ss')
          )
          record.metadata.setStandardMetadata(RecordMetadataKey.BLACK_NAME, '先手')
          record.metadata.setStandardMetadata(RecordMetadataKey.WHITE_NAME, '後手')
          record.metadata.setStandardMetadata(RecordMetadataKey.TITLE, object.title)
          record.metadata.setStandardMetadata(RecordMetadataKey.AUTHOR, object.authorname)
          record.metadata.setStandardMetadata(RecordMetadataKey.SOURCE, '詰将棋パラダイス')
          record.metadata.setStandardMetadata(RecordMetadataKey.LENGTH, object.progresscnt.toString())
          record.metadata.setStandardMetadata(RecordMetadataKey.OPUS_NO, object.workid.toString())
          return record
        }
      }
    })
)

export type TsumeObject = z.infer<typeof TsumeObject>
