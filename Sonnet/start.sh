#!/bin/bash
# Run migrations first, then start the server
node scripts/run-migrations.js && node server.js
