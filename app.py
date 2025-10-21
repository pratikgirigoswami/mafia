# app.py
"""
Mafia Assistant - Host-controlled (NiceGUI)
Features:
- Players join by name from their devices
- Host starts & locks session
- Roles auto-assigned using 30% Mafia rule
- Players can reveal only their own role (private dialog)
- Host controls phases (Night / Day / Voting / Eliminate)
- Auto win-check after each elimination
- Minimal, mobile-friendly UI
"""
from nicegui import ui
import random
import time
from typing import Dict, List

# -------------------------
# Game state
# -------------------------
state = {
    "session_started": False,
    "locked": False,
    "phase": "lobby",  # lobby, roles_assigned, night, day, voting, ended
    "players": [],  # list of dicts: {"name": str, "alive": True}
    "roles": {},  # name -> role
    "round": 0,
    "log": [],
    "votes": {},  # voter_name -> target_name (if voting by host later)
    "last_night_result": None,
    "winner": None
}

# -------------------------
# Utilities
# -------------------------
def now_ts() -> str:
    return time.strftime("%H:%M:%S")

def add_log(msg: str):
    state["log"].append(f"[{now_ts()}] {msg}")
    if len(state["log"]) > 300:
        state["log"].pop(0)
    ui.update()

def alive_names() -> List[str]:
    return [p["name"] for p in state["players"] if p["alive"]]

def find_player(name: str):
    for p in state["players"]:
        if p["name"].strip().lower() == name.strip().lower():
            return p
    return None

def compute_role_counts(n: int):
    # 30% mafia rule (rounded), at least 1 mafia
    num_mafia = max(1, round(n * 0.30))
    # ensure not exceed n-2
    num_mafia = min(num_mafia, max(1, n - 2))
    num_detective = 1 if n >= 6 else 0
    num_doctor = 1 if n >= 7 else 0
    num_citizens = n - (num_mafia + num_detective + num_doctor)
    if num_citizens < 0:
        # adjust by reducing mafia as needed
        while num_citizens < 0 and num_mafia > 1:
            num_mafia -= 1
            num_citizens = n - (num_mafia + num_detective + num_doctor)
    return {"mafia": num_mafia, "detective": num_detective, "doctor": num_doctor, "citizen": max(0, num_citizens)}

def auto_assign_roles():
    n = len(state["players"])
    counts = compute_role_counts(n)
    roles = (["Mafia"] * counts["mafia"] +
             ["Detective"] * counts["detective"] +
             ["Doctor"] * counts["doctor"] +
             ["Citizen"] * counts["citizen"])
    random.shuffle(roles)
    state["roles"] = {state["players"][i]["name"]: roles[i] for i in range(n)}
    add_log(f"Roles assigned (Mafia={counts['mafia']}, Detective={counts['detective']}, Doctor={counts['doctor']})")
    state["phase"] = "roles_assigned"

def check_win():
    alive = [p for p in state["players"] if p["alive"]]
    mafia_alive = [p for p in alive if state["roles"].get(p["name"]) == "Mafia"]
    non_mafia_alive = [p for p in alive if state["roles"].get(p["name"]) != "Mafia"]
    if len(mafia_alive) == 0:
        state["phase"] = "ended"
        state["winner"] = "Citizens"
        add_log("Citizens win! All Mafia eliminated.")
        return "Citizens"
    if len(mafia_alive) >= len(non_mafia_alive):
        state["phase"] = "ended"
        state["winner"] = "Mafia"
        add_log("Mafia win! Mafia equal or outnumber others.")
        return "Mafia"
    return None

# -------------------------
# UI layout
# -------------------------
ui.label("<h1 style='color:#ff3b3b'>🎭 Mafia Assistant</h1>", unsafe_html=True)

with ui.row().style("gap: 20px; align-items: start;"):
    # Host panel
    with ui.card().style("min-width:320px; max-width:420px; padding:12px"):
        ui.markdown("### Host Panel")
        start_btn = ui.button("Start Session (Host)", on_click=lambda: start_session()).props('color="primary"')
        lock_btn = ui.button("Lock Joining", on_click=lambda: lock_joining()).props('color="warning"')
        assign_btn = ui.button("Assign Roles (auto 30% Mafia)", on_click=lambda: assign_roles()).props('color="secondary"')
        ui.separator()
        ui.markdown("**Controls**")
        start_night_btn = ui.button("Start Night", on_click=lambda: start_night()).props('color="primary"')
        end_night_btn = ui.button("End Night (Resolve)", on_click=lambda: end_night()).props('color="secondary"')
        start_day_btn = ui.button("Start Day", on_click=lambda: start_day()).props('color="primary"')
        ui.separator()
        ui.markdown("**Manual elimination (Host)**")
        eliminate_select = ui.select(choices=[], label="Select to eliminate (host)", on_change=lambda e: None)
        eliminate_btn = ui.button("Eliminate Selected", on_click=lambda: host_eliminate(eliminate_select.value)).props('color="danger"')
        ui.separator()
        ui.markdown("Session Info")
        lbl_phase = ui.label(f"Phase: {state['phase']}")
        lbl_players = ui.label("Players: 0")
        lbl_round = ui.label("Round: 0")
        ui.markdown("Game Log")
        host_log = ui.textarea(value="\n".join(state["log"]), readonly=True).style("height: 220px; font-size:0.9rem")
        ui.button("Clear Log", on_click=lambda: clear_log()).props('color="default"')

    # Player panel
    with ui.card().style("flex: 1; padding:12px"):
        ui.markdown("### Player Panel")
        ui.markdown("**Join game (enter your name and press Join)**")
        name_input = ui.input(label="Your name", placeholder="Type your name")
        join_btn = ui.button("Join Game", on_click=lambda: player_join(name_input.value)).props('color="primary"')
        ui.markdown("**Players joined:**")
        joined_md = ui.markdown("_No players yet_")
        ui.separator()

        ui.markdown("**Reveal your role (private)**")
        reveal_name = ui.input(label="Your name to reveal role", placeholder="Enter exact name")
        reveal_btn = ui.button("Reveal My Role", on_click=lambda: reveal_role(reveal_name.value)).props('color="secondary"')
        ui.markdown("**Phase & Status**")
        status_md = ui.markdown("Session not started")
        ui.separator()

        ui.markdown("**Night (if host starts night, host will resolve result)**")
        ui.markdown("Detective may request investigation (if you are detective, use Reveal to see your role then Investigate below).")
        investigate_name = ui.input(label="Detective: your name (to investigate)", placeholder="Detective only")
        investigate_target = ui.select(choices=[], label="Investigate target (detective)")
        investigate_btn = ui.button("Investigate (Detective only)", on_click=lambda: detective_investigate(investigate_name.value, investigate_target.value))

# -------------------------
# Actions / Handlers
# -------------------------
def start_session():
    if state["session_started"]:
        add_log("Session already started.")
        return ui.notify("Session already started.")
    state["session_started"] = True
    state["locked"] = False
    state["phase"] = "lobby"
    state["players"].clear()
    state["roles"].clear()
    state["round"] = 0
    state["log"].clear()
    state["votes"].clear()
    state["last_night_result"] = None
    state["winner"] = None
    add_log("Host started session. Players may join.")
    update_ui()
    return ui.notify("Session started.")

def player_join(name: str):
    name = (name or "").strip()
    if not state["session_started"]:
        return ui.notify("Host hasn't started a session.")
    if state["locked"]:
        return ui.notify("Joining is closed.")
    if not name:
        return ui.notify("Enter a name.")
    if find_player(name):
        return ui.notify("Name already joined. Choose a unique name.")
    state["players"].append({"name": name, "alive": True})
    add_log(f"Player joined: {name}")
    update_ui()
    return ui.notify(f"Joined as {name}.")

def lock_joining():
    if not state["session_started"]:
        return ui.notify("Start a session first.")
    state["locked"] = True
    add_log("Host locked joining. Roles will be assigned when host clicks assign roles.")
    state["phase"] = "lobby_locked"
    update_ui()
    return ui.notify("Joining locked.")

def assign_roles():
    if not state["locked"]:
        return ui.notify("Lock joining before assigning roles.")
    if len(state["players"]) < 4:
        return ui.notify("At least 4 players required.")
    auto_assign_roles()
    update_ui()
    return ui.notify("Roles assigned. Players may reveal their own roles privately.")

def reveal_role(name: str):
    name = (name or "").strip()
    if not name:
        return ui.notify("Enter your name.")
    p = find_player(name)
    if not p:
        return ui.notify("Name not found.")
    if not state["roles"]:
        return ui.notify("Roles not assigned yet.")
    role = state["roles"].get(p["name"])
    if not role:
        return ui.notify("Role not found.")
    # show private dialog to the client who clicked
    with ui.dialog(title="Your Role", closable=True).bind() as d:
        ui.markdown(f"## {p['name']}, you are **{role}**")
        ui.markdown("This is private. Do not reveal it to other players.")
        ui.button("OK", on_click=d.close)
    add_log(f"{p['name']} viewed their role.")
    return

def update_selects():
    names = alive_names()
    eliminate_select.set_choices(names)
    investigate_target.set_choices(names)

def start_night():
    if state["phase"] not in ("roles_assigned", "day"):
        return ui.notify("Cannot start night now.")
    state["phase"] = "night"
    state["round"] += 1
    state["last_night_result"] = None
    add_log(f"Night {state['round']} started.")
    update_ui()
    return ui.notify("Night started. Host will resolve or use manual controls to eliminate/protect.")

def end_night():
    if state["phase"] != "night":
        return ui.notify("Night is not active.")
    # In Host-controlled mode: host should eliminate via the eliminate control (or use detective investigation prior)
    state["phase"] = "day"
    add_log("Night ended. Host may eliminate player if night kill chosen.")
    update_ui()
    return ui.notify("Night ended. Start Day or eliminate a player (host).")

def start_day():
    if state["phase"] not in ("roles_assigned", "night", "day", "voting"):
        return ui.notify("Cannot start day now.")
    state["phase"] = "day"
    add_log("Day started.")
    update_ui()
    return ui.notify("Day started.")

def host_eliminate(target_name: str):
    if not target_name:
        return ui.notify("Select a player to eliminate.")
    p = find_player(target_name)
    if not p:
        return ui.notify("Player not found.")
    if not p["alive"]:
        return ui.notify("Player is already dead.")
    p["alive"] = False
    role = state["roles"].get(p["name"], "Unknown")
    add_log(f"{p['name']} was eliminated by host. Role: {role}")
    state["last_night_result"] = f"{p['name']} eliminated (role: {role})"
    # auto-check win
    winner = check_win()
    update_ui()
    if winner:
        ui.notify(f"Game ended. {winner} win!")
    else:
        ui.notify(f"{p['name']} eliminated.")
    return

def detective_investigate(detective_name: str, target_name: str):
    detective_name = (detective_name or "").strip()
    target_name = (target_name or "").strip()
    if not detective_name or not target_name:
        return ui.notify("Enter detective name and target.")
    p = find_player(detective_name)
    if not p:
        return ui.notify("Your name not found.")
    if not p["alive"]:
        return ui.notify("Dead players cannot investigate.")
    if state["roles"].get(p["name"]) != "Detective":
        return ui.notify("You are not the Detective.")
    if target_name not in alive_names():
        return ui.notify("Invalid target.")
    is_mafia = state["roles"].get(target_name) == "Mafia"
    add_log(f"Detective ({detective_name}) investigated {target_name}: {'Mafia' if is_mafia else 'Not Mafia'} (private)")
    with ui.dialog(title="Investigation Result").bind() as dlg:
        ui.markdown(f"Investigation result for **{target_name}**: **{'Mafia' if is_mafia else 'Not Mafia'}**")
        ui.button("OK", on_click=dlg.close)
    return

def clear_log():
    state["log"].clear()
    update_ui()

# -------------------------
# UI update helper
# -------------------------
def update_ui():
    lbl_phase.set_text(f"Phase: {state['phase']}")
    lbl_players.set_text(f"Players: {len(state['players'])} (alive: {len(alive_names())})")
    lbl_round.set_text(f"Round: {state['round']}")
    joined = "\n".join([f"- {p['name']}{' (dead)' if not p['alive'] else ''}" for p in state['players']]) or "_No players yet_"
    joined_md.set_content(joined)
    host_log.set_value("\n".join(state["log"]))
    status_line = f"Session started: {state['session_started']} | Locked: {state['locked']} | Phase: {state['phase']}"
    status_md.set_content(status_line)
    update_selects()
    ui.update()

# init UI
update_ui()
ui.run(title="Mafia Assistant")
