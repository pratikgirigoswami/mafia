from nicegui import ui

ui.run(title='Mafia Assistant', port=8080, reload=True)

ui.label('🎭 Mafia Assistant').style(
    'font-size: 2.5rem; color: red; text-align: center; margin-top: 2rem'
)

ui.label('Welcome! This is your first test page for the Mafia Assistant.').style(
    'color: #bbb; text-align: center; margin-bottom: 2rem'
)

def say_hello():
    ui.notify('Hello, Detective! Your Mafia Assistant is online. 🕵️‍♂️')

ui.button('Say Hello', on_click=say_hello).style(
    'display: block; margin: 0 auto; padding: 0.5rem 1.5rem; font-size:1rem; margin-top:2rem'
)
