/**
 * @module plugin
 *
 * Registers all MLB Stream Deck key actions and connects to the Stream Deck app.
 * Log level `info` keeps plugin logs readable; use `trace` only when debugging SDK traffic.
 */
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

streamDeck.connect();
