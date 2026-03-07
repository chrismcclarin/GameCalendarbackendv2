// routes/bullBoard.js
// Bull Board admin dashboard with Auth0 + admin role protection
const { createBullBoard } = require('@bull-board/api');
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');
const { ExpressAdapter } = require('@bull-board/express');
const { verifyAuth0Token } = require('../middleware/auth0');
const { requireGroupAdmin } = require('../middleware/adminAuth');
const { promptQueue, deadlineQueue, reminderQueue } = require('../queues');

/**
 * Mount Bull Board dashboard with Auth0 protection
 * @param {Express.Application} app - Express app instance
 */
function mountBullBoard(app) {
  // Create server adapter for Express
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queues');

  // Create Bull Board with all queues
  createBullBoard({
    queues: [
      new BullMQAdapter(promptQueue),
      new BullMQAdapter(deadlineQueue),
      new BullMQAdapter(reminderQueue)
    ],
    serverAdapter,
    options: {
      uiConfig: {
        boardTitle: 'Periodic Table Top - Job Queues',
        boardLogo: {
          path: '/logo.png',
          width: '40px',
          height: '40px'
        },
        favIcon: {
          default: '/favicon.ico',
          alternative: '/favicon.ico'
        }
      }
    }
  });

  // Mount with Auth0 + admin role protection
  app.use(
    '/admin/queues',
    verifyAuth0Token,
    requireGroupAdmin,
    serverAdapter.getRouter()
  );

  console.log('Bull Board mounted at /admin/queues (Auth0 + admin role protected)');
}

module.exports = mountBullBoard;
