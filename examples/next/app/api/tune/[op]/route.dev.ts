import { tuneRoute } from "@enitrat/tune/next"

import config from "../../../../tune.config"

export const { GET, POST, OPTIONS } = tuneRoute(config)
