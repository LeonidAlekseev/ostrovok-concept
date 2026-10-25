# Image credits

Photos were downloaded from Wikimedia Commons and processed by `scripts/build-images.py`
(crop, resize, WebP). The globe geometry `public/data/globe.json` is built by
`scripts/build-globe.py` from [Natural Earth](https://www.naturalearthdata.com/) 1:50m land and
coastlines (public domain). The cloud photos in `hero/clouds/` were provided by the project owner and cut out by
`scripts/build-clouds.py`. The images of the «Это твой вайб» block (`vibe/card-calm.webp`, `vibe/card-loud.webp`,
`vibe/vs-letters.webp`, `vibe/vs-lightning.webp`) were provided by the project owner.

| File                       | Source                                                                                                                                                                                                                                                                     | Author         | License      |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------ |
| `vibe/evening-left.webp`   | [Rempart Boutique Hotel Diyarbakir Suite Room Interior](https://commons.wikimedia.org/wiki/File:Rempart_Boutique_Hotel_Diyarbakir_Suite_Room_Interior.jpg)                                                                                                                 | Ouuzo          | CC BY 4.0    |
| `vibe/evening-right.webp`  | [DFC 5189 Rooftop bar glowing at night overlooking the glittering cityscape of Pattaya](https://commons.wikimedia.org/wiki/File:DFC_5189_Rooftop_bar_glowing_at_night_overlooking_the_glittering_cityscape_of_Pattaya.jpg)                                                 | PattayaPatrol  | CC BY-SA 4.0 |
| `vibe/place-left.webp`     | [Sunset in the Aegean Sea Kremasti Beach Rhodes 31 August 2018](https://commons.wikimedia.org/wiki/File:Sunset_in_the_Aegean_Sea_Kremasti_Beach_Rhodes_31_August_2018.jpg)                                                                                                 | Pjotr Mahhonin | CC BY-SA 4.0 |
| `vibe/place-right.webp`    | [1 singapore city skyline dusk panorama 2011](https://commons.wikimedia.org/wiki/File:1_singapore_city_skyline_dusk_panorama_2011.jpg)                                                                                                                                     | chenisyuan     | CC BY-SA 4.0 |
| `vibe/size-left.webp`      | [Lushna Boutique Cabin hotel Room Oliverea Valley, NY](https://commons.wikimedia.org/wiki/File:Lushna_Boutique_Cabin_hotel_Room_Oliverea_Valley,_NY.jpg)                                                                                                                   | Jaka Lushna    | CC BY-SA 4.0 |
| `vibe/size-right.webp`     | [Sopot 2023 26 Grand Hotel](https://commons.wikimedia.org/wiki/File:Sopot_2023_26_Grand_Hotel.jpg)                                                                                                                                                                         | Scotch Mist    | CC BY-SA 4.0 |
| `vibe/leisure-left.webp`   | [Indoor pool of spa with open door at Amantaka luxury Resort & Hotel in Luang Prabang Laos](https://commons.wikimedia.org/wiki/File:Indoor_pool_of_spa_with_open_door_at_Amantaka_luxury_Resort_%26_Hotel_in_Luang_Prabang_Laos.jpg)                                       | Basile Morin   | CC BY-SA 4.0 |
| `vibe/leisure-right.webp`  | [DFC 1204 Evening lights shimmer on the water as people stroll and relax along the lively beachfront promenade](https://commons.wikimedia.org/wiki/File:DFC_1204_Evening_lights_shimmer_on_the_water_as_people_stroll_and_relax_along_the_lively_beachfront_promenade.jpg) | PattayaPatrol  | CC BY-SA 4.0 |
| `vibe/food-left.webp`      | [Breakfast in bed (Unsplash)](<https://commons.wikimedia.org/wiki/File:Breakfast_in_bed_(Unsplash).jpg>)                                                                                                                                                                   | Toa Heftiba    | CC0          |
| `vibe/food-right.webp`     | [DZ6 2644 Cozy candlelit dinner tables set for an intimate evening at a charming Thai restaurant](https://commons.wikimedia.org/wiki/File:DZ6_2644_Cozy_candlelit_dinner_tables_set_for_an_intimate_evening_at_a_charming_Thai_restaurant.jpg)                             | PattayaPatrol  | CC BY-SA 4.0 |
| `vibe/budget-left.webp`    | [Cleveland Hostel room](https://commons.wikimedia.org/wiki/File:Cleveland_Hostel_room.jpg)                                                                                                                                                                                 | Sumanah        | CC BY-SA 4.0 |
| `vibe/budget-right.webp`   | [Grand Hotel Kraków - Apartament księżnej Czartoryskiej](https://commons.wikimedia.org/wiki/File:Grand_Hotel_Krak%C3%B3w_-_Apartament_ksi%C4%99%C5%BCnej_Czartoryskiej.jpg)                                                                                                | GrandHotelKrk  | CC BY-SA 4.0 |
| `vibe/location-left.webp`  | [Pier by Sabine Hut 16-9, Nelson Lakes National Park, New Zealand](https://commons.wikimedia.org/wiki/File:Pier_by_Sabine_Hut_16-9,_Nelson_Lakes_National_Park,_New_Zealand.jpg)                                                                                           | Michal Klajban | CC BY-SA 4.0 |
| `vibe/location-right.webp` | [Fuente de la Plaza Nueva, Liubliana, Eslovenia, 2017-04-14, DD 50-52 HDR](https://commons.wikimedia.org/wiki/File:Fuente_de_la_Plaza_Nueva,_Liubliana,_Eslovenia,_2017-04-14,_DD_50-52_HDR.jpg)                                                                           | Diego Delso    | CC BY-SA 4.0 |
| `vibe/balance.webp`        | [From Temple of Olympian Zeus to Lycabetus Athens Greece](https://commons.wikimedia.org/wiki/File:From_Temple_of_Olympian_Zeus_to_Lycabetus_Athens_Greece.jpg)                                                                                                             | Jebulon        | CC0          |

## Star search

`stars/sky.webp`, `stars/sky-mobile.webp` (night sky with the Moon) and `stars/orb.webp` (magic orb) are
provided by the project owner; `scripts/build-images.py` resizes them to WebP. The source PNGs are not kept
in the repository.

## Draw search

`draw/bg.webp`, `draw/bg-mobile.webp` (watercolour bay), `draw/preview.webp` (child's drawing of the sea) and
`draw/result.webp`, `draw/result-mobile.webp` (islands with a route) are provided by the project owner;
`scripts/build-draw-images.mjs` converts them to WebP and cleans the speckles off the drawing's alpha. The source
PNGs are not kept in the repository.
