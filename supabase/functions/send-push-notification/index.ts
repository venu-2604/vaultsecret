import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PushPayload {
  type: 'new_message' | 'user_online' | 'user_typing'
  room_id: string
  sender_id: string
  sender_name?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const payload: PushPayload = await req.json()
    const { type, room_id, sender_id, sender_name } = payload

    if (!type || !room_id || !sender_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Get device tokens for other participants in this room (not the sender)
    const { data: tokens, error: tokensError } = await supabase
      .from('device_tokens')
      .select('token, user_id')
      .eq('room_id', room_id)
      .neq('user_id', sender_id)

    if (tokensError || !tokens || tokens.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No tokens to notify' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // For user_online notifications, only notify offline users
    if (type === 'user_online') {
      const recipientIds = tokens.map(t => t.user_id)
      const { data: participants } = await supabase
        .from('room_participants')
        .select('user_id, is_online')
        .eq('room_id', room_id)
        .in('user_id', recipientIds)

      const offlineUserIds = new Set(
        (participants || [])
          .filter(p => !p.is_online)
          .map(p => p.user_id)
      )

      // Only keep tokens for offline users
      const filteredTokens = tokens.filter(t => offlineUserIds.has(t.user_id))
      if (filteredTokens.length === 0) {
        return new Response(
          JSON.stringify({ message: 'All recipients are online' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Build notification content based on type
    let title = ''
    let body = ''

    switch (type) {
      case 'new_message':
        title = sender_name || 'New Message'
        body = 'You received a new message'
        break
      case 'user_online':
        title = sender_name || 'Contact Online'
        body = `${sender_name || 'Someone'} is now online`
        break
      case 'user_typing':
        title = sender_name || 'Typing...'
        body = `${sender_name || 'Someone'} is typing...`
        break
    }

    // Get Firebase access token using service account
    const serviceAccountJson = Deno.env.get('FIREBASE_SERVICE_ACCOUNT')
    if (!serviceAccountJson) {
      return new Response(
        JSON.stringify({ error: 'Firebase service account not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const serviceAccount = JSON.parse(serviceAccountJson)
    const accessToken = await getFirebaseAccessToken(serviceAccount)

    // Send FCM v1 notifications
    const projectId = serviceAccount.project_id
    const results = await Promise.allSettled(
      tokens.map(async ({ token }) => {
        const message: Record<string, unknown> = {
          message: {
            token,
            notification: { title, body },
            data: { roomId: room_id, type },
            android: {
              priority: type === 'user_typing' ? 'normal' : 'high',
              notification: {
                channel_id: 'chat_notifications',
                sound: type === 'user_typing' ? undefined : 'default',
              },
            },
          },
        }

        const res = await fetch(
          `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(message),
          }
        )

        if (!res.ok) {
          const errBody = await res.text()
          // If token is invalid, remove it
          if (res.status === 404 || res.status === 400) {
            await supabase.from('device_tokens').delete().eq('token', token)
          }
          throw new Error(`FCM error ${res.status}: ${errBody}`)
        }

        return await res.json()
      })
    )

    return new Response(
      JSON.stringify({ sent: results.length, results: results.map(r => r.status) }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

// --- Firebase OAuth2 token generation using JWT ---

async function getFirebaseAccessToken(serviceAccount: {
  client_email: string
  private_key: string
  token_uri: string
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const claimSet = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: serviceAccount.token_uri || 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }

  const encodedHeader = base64url(JSON.stringify(header))
  const encodedClaim = base64url(JSON.stringify(claimSet))
  const signInput = `${encodedHeader}.${encodedClaim}`

  const signature = await signRS256(signInput, serviceAccount.private_key)
  const jwt = `${signInput}.${signature}`

  const tokenRes = await fetch(serviceAccount.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })

  const tokenData = await tokenRes.json()
  return tokenData.access_token
}

function base64url(str: string): string {
  const encoded = btoa(str)
  return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64urlBytes(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  const encoded = btoa(binary)
  return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function signRS256(input: string, privateKeyPem: string): Promise<string> {
  const pemContents = privateKeyPem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\n/g, '')

  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0))

  const key = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signatureBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(input)
  )

  return base64urlBytes(new Uint8Array(signatureBuffer))
}
