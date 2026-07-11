import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface OutboxEvent {
  id: string;
  event_type: string;
  user_id: string;
  payload: Record<string, unknown>;
  attempts: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  // Fetch unprocessed events (max 50 per run, oldest first)
  const { data: events, error: fetchErr } = await supabase
    .from("game_event_outbox")
    .select("*")
    .eq("processed", false)
    .lt("attempts", 5)
    .order("created_at", { ascending: true })
    .limit(50);

  if (fetchErr) {
    return new Response(
      JSON.stringify({ error: fetchErr.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (!events || events.length === 0) {
    return new Response(
      JSON.stringify({ processed: 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  let processedCount = 0;
  const errors: string[] = [];

  for (const event of events as OutboxEvent[]) {
    try {
      await processEvent(supabase, event);

      // Mark processed
      await supabase
        .from("game_event_outbox")
        .update({ processed: true, processed_at: new Date().toISOString() })
        .eq("id", event.id);

      processedCount++;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      errors.push(`${event.id}: ${errMsg}`);

      // Increment attempt count and record last error
      await supabase
        .from("game_event_outbox")
        .update({
          attempts: event.attempts + 1,
          last_error: errMsg,
        })
        .eq("id", event.id);
    }
  }

  return new Response(
    JSON.stringify({ processed: processedCount, errors }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});

async function processEvent(
  supabase: ReturnType<typeof createClient>,
  event: OutboxEvent
): Promise<void> {
  if (event.event_type !== "spin_completed") return;

  const { spin_request_id, prize_type, points_deducted, spin_type } = event.payload as {
    spin_request_id: string;
    prize_type: string;
    points_deducted: number;
    spin_type: string;
  };

  // 1. Update spin activity streak
  await supabase.rpc("update_spin_streak", { p_user_id: event.user_id });

  // 2. Publish to live winners feed (non-miss wins only)
  if (prize_type && prize_type !== "miss") {
    await supabase.rpc("publish_winner_event", {
      p_spin_request_id: spin_request_id,
    });
  }

  // 3. Jackpot contribution (paid spins only)
  if (spin_type === "paid" && points_deducted > 0) {
    await supabase.rpc("contribute_to_jackpot", {
      p_spin_id: spin_request_id,
      p_user_id: event.user_id,
      p_spin_cost: points_deducted,
    });
  }

  // 4. Update combo state
  await updateComboState(supabase, event.user_id, prize_type, spin_request_id);

  // 5. Mission progress: update spin_count missions
  await updateMissionProgress(supabase, event.user_id);
}

async function updateComboState(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  prizeType: string,
  spinRequestId: string
): Promise<void> {
  // Check flag
  const { data: flag } = await supabase
    .from("engagement_flags")
    .select("enabled")
    .eq("flag", "combo")
    .maybeSingle();

  if (!flag?.enabled) return;

  // Upsert combo state
  const isWin = prizeType !== "miss";

  const { data: current } = await supabase
    .from("user_combo_state")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  const newConsecutive = isWin ? (current?.consecutive_wins ?? 0) + 1 : 0;

  // Find applicable combo
  const { data: comboDef } = await supabase
    .from("combo_definitions")
    .select("*")
    .lte("required_wins", newConsecutive)
    .eq("is_active", true)
    .order("required_wins", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (current) {
    await supabase
      .from("user_combo_state")
      .update({
        consecutive_wins: newConsecutive,
        current_multiplier: comboDef?.multiplier ?? 1.0,
        active_combo_id: comboDef?.id ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
  } else {
    await supabase.from("user_combo_state").insert({
      user_id: userId,
      consecutive_wins: newConsecutive,
      current_multiplier: comboDef?.multiplier ?? 1.0,
      active_combo_id: comboDef?.id ?? null,
    });
  }
}

async function updateMissionProgress(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<void> {
  // Check flag
  const { data: flag } = await supabase
    .from("engagement_flags")
    .select("enabled")
    .eq("flag", "missions")
    .maybeSingle();

  if (!flag?.enabled) return;

  const today = new Date().toISOString().split("T")[0];

  // Get active spin-count missions
  const { data: missions } = await supabase
    .from("daily_missions")
    .select("*")
    .eq("is_active", true)
    .eq("objective_type", "spin_count");

  if (!missions) return;

  for (const mission of missions) {
    // Check if player already has this mission today
    const { data: existing } = await supabase
      .from("player_missions")
      .select("*")
      .eq("user_id", userId)
      .eq("mission_id", mission.mission_id)
      .gte("date", today)
      .maybeSingle();

    if (existing) {
      if (!existing.completed) {
        const newProgress = existing.progress + 1;
        const completed = newProgress >= mission.objective_target;

        await supabase
          .from("player_missions")
          .update({
            progress: newProgress,
            completed,
          })
          .eq("id", existing.id);
      }
    } else {
      // Create mission progress row
      await supabase.from("player_missions").insert({
        user_id: userId,
        mission_id: mission.mission_id,
        progress: 1,
        completed: mission.objective_target <= 1,
        claimed_reward: false,
        date: today,
      });
    }
  }
}
