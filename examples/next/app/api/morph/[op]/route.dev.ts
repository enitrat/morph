import { morphRoute } from "@enitrat/morph/next"

import config from "../../../../morph.config"

export const { GET, POST, OPTIONS } = morphRoute(config)
