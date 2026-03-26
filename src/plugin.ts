import streamDeck from "@elgato/streamdeck";

import { MlbGameScore } from "./actions/mlb-game-score";
import { MlbTeamLogo } from "./actions/mlb-team-logo";

// We can enable "trace" logging so that all messages between the Stream Deck, and the plugin are recorded. When storing sensitive information
streamDeck.logger.setLevel("trace");

streamDeck.actions.registerAction(new MlbTeamLogo());
streamDeck.actions.registerAction(new MlbGameScore());

// Finally, connect to the Stream Deck.
streamDeck.connect();
