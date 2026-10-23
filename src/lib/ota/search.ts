import { z } from 'zod'

/**
 * An Ostrovok search result (the JSON of `npm run db:seed:valencia`): only the fields the catalogue uses are
 * checked here; the loader keeps the whole objects in `public.ota_hotels` and `public.ota_searches`.
 */

const image = z.object({ tmpl: z.string().includes('{size}') })

const paymentType = z.object({
  /** `now`, `hotel`, … */
  type: z.string(),
  /** The whole stay, ₽. */
  amount: z.coerce.number().positive(),
  /** One night, ₽. */
  average_show_price_per_day: z.coerce.number().positive(),
})

const rate = z.object({
  /** Guests the rate is for. */
  occupancy: z.number().int().positive(),
  payment_options: z.object({ payment_types: z.array(paymentType).min(1) }),
  cancellation_info: z.object({
    policies: z.array(z.object({ end_at: z.string().nullable() })),
    free_cancellation_before: z.string().nullable(),
  }),
  rooms: z
    .array(
      z.object({
        rg_hash: z.string(),
        room_name: z.string(),
        room_data_trans: z
          .object({ ru: z.object({ main_name: z.string().optional(), bedding_type: z.string().optional() }) })
          .optional(),
        /** `nomeal`, `breakfast`, … */
        meal: z.array(z.string()),
        /** m². */
        size: z.number().nullish(),
      }),
    )
    .min(1),
})

const staticHotel = z.object({
  name: z.string().min(1),
  address: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  /** `Hotel`, `Hostel`, `Aparthotel`, … */
  kind: z.string(),
  /** Stars × 10 (40 is 4★); absent for a hotel without a classification. */
  star_rating: z.number().optional(),
  /** Guest rating out of 10; absent while nobody has rated the hotel. */
  rating_total: z.number().optional(),
  rating: z.object({ count: z.number().int().nonnegative().optional() }),
  images: z.array(image),
  nearest_subways: z.array(z.object({ name: z.string(), distance: z.number() })),
  /** `has_internet`, `has_parking`, `air-conditioning`, … */
  serp_filters: z.array(z.string()),
  room_groups: z.array(
    z.object({
      rg_hash: z.string(),
      name_struct: z.object({ main_name: z.string(), bedding_type: z.string().optional() }),
    }),
  ),
  /** Km to the centre of the searched region. */
  search_region_center_distance: z.number(),
})

export const otaHotelSchema = z.object({
  master_id: z.number().int().positive(),
  ota_hotel_id: z.string().min(1),
  static_vm: staticHotel,
  rates: z.array(rate),
})

export const otaMapHotelSchema = z.object({
  master_id: z.number().int().positive(),
  /** The whole stay of the search, ₽. */
  price: z.number().positive(),
})

export const otaSearchSchema = z.object({
  hotels: z.array(otaHotelSchema).min(1),
  map_hotels: z.array(otaMapHotelSchema),
})

export type OtaHotel = z.infer<typeof otaHotelSchema>
export type OtaRate = OtaHotel['rates'][number]
export type OtaMapHotel = z.infer<typeof otaMapHotelSchema>
export type OtaSearch = z.infer<typeof otaSearchSchema>
