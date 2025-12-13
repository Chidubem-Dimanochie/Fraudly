# migrate_add_usernames.py
"""
Migration script to add username + fullName fields to existing users.
Run this once to update your existing MongoDB data.

- username comes from:
  preferred_username (if present) -> Cognito Username -> email-based fallback
- fullName comes from Cognito attribute:
  name  (single field in Cognito)
"""
import boto3
from connect import db
from botocore.exceptions import ClientError

# Initialize Cognito client
cognito_client = boto3.client('cognito-idp', region_name='us-east-1')
USER_POOL_ID = 'us-east-1_HgEmPHJj8'

users_collection = db.get_collection("users")


def generate_username_from_email(email: str) -> str:
    """Generate a username from an email address."""
    return email.split('@')[0].lower().replace('.', '').replace('-', '')


def get_cognito_user_by_email(email: str):
    """
    Fetch the Cognito user object by email.
    Returns the Cognito user dict if found, else None.
    """
    try:
        resp = cognito_client.list_users(
            UserPoolId=USER_POOL_ID,
            Filter=f'email = "{email}"',
            Limit=1
        )
        users = resp.get("Users", [])
        return users[0] if users else None
    except Exception as e:
        print(f"  ⚠ Could not fetch from Cognito: {e}")
        return None


def extract_username_and_name(cognito_user: dict, email: str):
    """
    Extract:
      - username: preferred_username -> Cognito Username -> email-based fallback
      - fullName: Cognito attribute "name" (single field)
    """
    username = None
    full_name = None

    try:
        # Attributes array includes 'name', 'email', etc.
        for attr in cognito_user.get("Attributes", []):
            if attr.get("Name") == "preferred_username" and attr.get("Value"):
                username = attr["Value"]
            if attr.get("Name") == "name" and attr.get("Value"):
                full_name = attr["Value"]

        # fallback username to Cognito Username if preferred_username missing
        if not username:
            username = cognito_user.get("Username")

    except Exception:
        pass

    # final fallback username to email-derived
    if not username:
        username = generate_username_from_email(email)

    return username, full_name


def main():
    print("=" * 60)
    print("DATABASE MIGRATION: Adding Username + FullName Fields")
    print("=" * 60)

    users = list(users_collection.find({}))
    print(f"\nFound {len(users)} users in database\n")

    updated_count = 0
    error_count = 0
    skipped_count = 0

    for user in users:
        email = user.get('email')
        if not email:
            print("✗ Skipping record: no email")
            skipped_count += 1
            continue

        existing_username = user.get('username')
        existing_fullname = user.get('fullName')

        # If both already exist, skip
        if existing_username and existing_fullname:
            print(f"✓ {email} already has username + fullName")
            skipped_count += 1
            continue

        try:
            cognito_user = get_cognito_user_by_email(email)

            if cognito_user:
                username, full_name = extract_username_and_name(cognito_user, email)
            else:
                username = generate_username_from_email(email)
                full_name = None

            # Resolve username conflict
            conflict = users_collection.find_one({
                "username": username,
                "email": {"$ne": email}
            })

            if conflict:
                base_username = username
                counter = 1
                while users_collection.find_one({
                    "username": f"{base_username}{counter}",
                    "email": {"$ne": email}
                }):
                    counter += 1
                username = f"{base_username}{counter}"
                print(f"  ⚠ Username conflict resolved: {base_username} → {username}")

            update_fields = {}

            # Only set username if missing
            if not existing_username:
                update_fields["username"] = username

            # Only set fullName if missing AND we found it in Cognito
            if not existing_fullname and full_name:
                update_fields["fullName"] = full_name

            if not update_fields:
                print(f"✓ {email} nothing to update")
                skipped_count += 1
                continue

            result = users_collection.update_one(
                {"email": email},
                {"$set": update_fields}
            )

            if result.modified_count > 0:
                print(f"✓ Updated {email} → {update_fields}")
                updated_count += 1
            else:
                print(f"✗ Failed to update {email}")
                error_count += 1

        except Exception as e:
            print(f"✗ Error processing {email}: {e}")
            error_count += 1

    print("\n" + "=" * 60)
    print("Migration Complete!")
    print(f"  Updated: {updated_count}")
    print(f"  Errors: {error_count}")
    print(f"  Skipped: {skipped_count}")
    print(f"  Total:   {len(users)}")
    print("=" * 60)


if __name__ == "__main__":
    main()
