import json

def convert_uivision_to_yaml(uivision_json_str):
    try:
        parsed_json = json.loads(uivision_json_str)
        yaml_output = f"name: {parsed_json.get('Name', 'Unnamed Workflow')}\nsteps:\n"

        for command in parsed_json.get('Commands', []):
            action = command.get('Command')
            target = command.get('Target')
            value = command.get('Value')

            yaml_output += f"  - action: {action}\n"
            if target:
                # Escape single quotes within the target string and enclose in single quotes
                escaped_target = target.replace("'", "''")
                yaml_output += f"    target: '{escaped_target}'\n"
            if value:
                # Escape single quotes within the value string and enclose in single quotes
                escaped_value = value.replace("'", "''")
                yaml_output += f"    value: '{escaped_value}'\n"
        return yaml_output
    except json.JSONDecodeError as e:
        return f"Error: Invalid JSON input - {e}"
    except Exception as e:
        return f"Error: An unexpected error occurred - {e}"