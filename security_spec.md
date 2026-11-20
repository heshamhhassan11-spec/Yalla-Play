# Security Specification (Phase 0)

## 1. Data Invariants
1. A `UserProfile` document at `/users/{userId}` can only be modified by the verified owner (`request.auth.uid == userId`, with bounded daily-task coin rewards `<= existing().coins + 120` and stats bounds) or `isAdmin()` (`coins`, `bannedUntilMs`), and collection queries on `/users` are strictly bounded (`limit <= 10`).
2. User PII (`email`, `photoURL`) is strictly isolated in `/users/{userId}/private/account` and readable/writable only by `userId`.
3. `VoiceRoom` documents enforce immutable `ownerId`, `roomId`, `tier`, `createdAt == request.time`, atomic coin deduction (`>= 2000`) in the same batch when creating a `'basic'` room, and bounded XP progression (`<= +200` per gift).
4. `VoiceRoomStaff` subcollection documents enforce the Master Gate (`get()` on parent `/voiceRooms/{roomId}` confirming `ownerId == request.auth.uid`).
5. Every string field enforces strict `.size()` bounds and every document ID enforces `isValidId()` (`^[a-zA-Z0-9_\\-]+$`).
6. `RechargeRequest` documents at `/rechargeRequests/{requestId}` can only be created in `status: 'pending'` by their authenticated owner, read/listed strictly by the owner (`userId == request.auth.uid`) or verified bootstrapped admin (`email_verified == true` and email in admin allowlist), and transitioned from `'pending'` to `'approved'` / `'rejected'` strictly by `isAdmin()`.
7. Users can only deduct (`<= existing().coins`) or claim bounded daily task rewards (`<= existing().coins + 120`) on their own coin balance; only `isAdmin()` can grant larger store credits and create `'store_purchase'` ledger entries.
8. `UserReport` and `SupportTicket` / `SupportMessage` documents enforce full field allowlists (`hasAll`/`hasOnly`), length limits, `createdAt == request.time`, ticket/message atomicity (`existsAfter`/`getAfter`), and lock closed tickets against user replies.

## 2. The Dirty Dozen Adversarial Payloads
1. **Identity Spoofing**: Creating `/users/victim_uid` with `uid: "attacker_uid"`.
2. **PII Read Leak**: Reading `/users/victim_uid/private/account` or `/rechargeRequests/{otherReq}` from another signed-in user.
3. **Ghost Field Shadow Update**: Updating `/users/my_uid` with `{ name: "Ali", isAdmin: true }`.
4. **ID Poisoning**: Creating `/voiceRooms/../../../../etc/passwd` or 1.5KB junk ID.
5. **Unverified Email Bypass**: Attempting write or admin escalation with `email_verified: false`.
6. **Owner Hijack**: Updating `/voiceRooms/{roomId}` to change `ownerId` to another UID.
7. **Timestamp Forgery**: Setting `createdAt` or `updatedAt` to a past timestamp instead of `request.time`.
8. **Type Poisoning**: Writing `coins: "infinite"` (string instead of number) or `coins: -999`.
9. **Unauthorized Staff Assignment**: Non-owner writing to `/voiceRooms/{roomId}/staff/{uid}`.
10. **Invalid Enum**: Setting `tier: "enterprise"`, `paymentMethod: "crypto"`, or `status: "free_coins"`.
11. **Oversized String DoW**: Writing a 500KB `bio`, `title`, or >250KB `receiptImage`.
12. **Self-Approval / Re-Approval Double Credit**: Regular user creating `status: "approved"` recharge request, increasing own `coins` without admin, or admin re-updating an already `'approved'` request.
