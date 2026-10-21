Nick sends.

**Devlog: Squiggle 2.0, what moved and why**

Until 2.0 Squiggle ran as one Node process on one machine. Every room, save and chat line went through it. 2.0 moves all of it to Cloudflare: three Workers (pages, API, rooms), a Durable Object for every room, D1 for accounts and projects, and R2 for files.

The point is consistency and persistence, not speed. A room is placed near whoever opens it, so edits and chat travel a shorter way for a group in one area. Your own sprite still moves on your own screen, exactly as before. Nothing here lowers input lag or raises frame rate.

The other half is Game Rules. Scores, rounds, teams, items and hits are things every player has to agree on. In 2.0 you build those on one Game Rules sprite with gold-edged blocks, and the server compiles them into a program it can run on a 20 Hz tick, with prediction for your own sprite and interpolation for everyone else. Once it is on, a modified client cannot write its own score, and a game keeps going when the host closes the tab. The game server ships switched off. The blocks, the compiler, the checker and the server side are in; turning it on is what is next.

The move runs behind a write fence: the old server exports, the new one imports, smoke tests run against a fenced host, and only then do writes open again. Accounts, passwords, projects, rooms, play links and consent come across as they were.

Numbers: 210 editor commits, 199 server commits, fourteen lanes of work.

Full notes: CHANGELOG.md in the editor repository.
