# Peer-To-Peer Multiplayer

Status: open
Filed: 2026-08-13

Remote head-to-head play, which already exists in BTK's F-Class simulation over PeerJS and WebRTC and
could be ported rather than invented. Deliberately deferred — a candidate to revisit once the core
single-player loop is complete.

Note (2026-09-08, from the exploration `Native-Swift-Port`): the project is moving to a native Swift app
and retiring the web/PWA build, so "port PeerJS/WebRTC" no longer holds — this would need a native
transport (e.g. GameKit or Multipeer Connectivity) instead when picked up. The goal (remote head-to-head
play) is unaffected.
