import { retouchRoute } from "@enitrat/tune/bridge"

import config from "../../../../tune.config"

export const { GET, POST, OPTIONS } = retouchRoute(config)
