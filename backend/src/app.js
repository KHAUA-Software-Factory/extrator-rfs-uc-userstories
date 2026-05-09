import express from 'express';
import cors from 'cors';
import { createRequireFirebaseUser } from './middleware/requireFirebaseUser.js';

import { registerEnsureClaimsRoute } from './features/auth/ensureClaims.route.js';
import { registerExtractRequirementsRoute } from './features/requirements/extractRequirements.route.js';
import { registerSessionsRoute } from './features/sessions/sessions.route.js';
import { registerGenerateUseCasesRoute } from './features/useCases/generateUseCases.route.js';
import { registerGenerateUmlRoute } from './features/uml/generateUml.route.js';
import { registerGenerateUserStoriesRoute } from './features/userStories/generateUserStories.route.js';

export function createApp({ openai, adminApp, adminEmails, env = process.env } = {}) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  const requireFirebaseUser = createRequireFirebaseUser({ adminApp, devBypassEnv: env });

  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      firebaseAdminConfigured: Boolean(adminApp),
      openaiConfigured: Boolean(openai),
    });
  });

  registerEnsureClaimsRoute({ app, adminApp, adminEmails, requireFirebaseUser });
  registerSessionsRoute({ app, adminApp, requireFirebaseUser });
  registerExtractRequirementsRoute({ app, openai, requireFirebaseUser, env });
  registerGenerateUseCasesRoute({ app, openai, requireFirebaseUser, env });
  registerGenerateUmlRoute({ app, openai, requireFirebaseUser, env });
  registerGenerateUserStoriesRoute({ app, openai, requireFirebaseUser, env });

  return app;
}
