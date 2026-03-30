import streamDeck from "@elgato/streamdeck";

import { MlbDivisionStandings } from "./actions/mlb-division-standings";
import { MlbGameScore } from "./actions/mlb-game-score";
import { MlbStatsLeaders } from "./actions/mlb-stats-leaders";
import { MlbTeamLogo } from "./actions/mlb-team-logo";

streamDeck.logger.setLevel("info");

streamDeck.actions.registerAction(new MlbTeamLogo());
streamDeck.actions.registerAction(new MlbGameScore());
streamDeck.actions.registerAction(new MlbDivisionStandings());
streamDeck.actions.registerAction(new MlbStatsLeaders());

// Finally, connect to the Stream Deck.
streamDeck.connect();
