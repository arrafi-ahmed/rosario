<script setup>
import PageTitle from "@/components/PageTitle.vue";
import {computed, onMounted, reactive, ref} from "vue";
import {useRoute} from "vue-router";
import {useStore} from "vuex";
import {toast} from "vue-sonner";
import {generatePassword} from "@/others/util";
import ConfirmationDialog from "@/components/ConfirmationDialog.vue";

const store = useStore();
const route = useRoute();

const admins = computed(() => store.state.appUser.admins);
const club = computed(() =>
  store.getters["club/getClubById"](route.params.clubId),
);

const accordion = ref(["admins"]);
const addAdminDialog = ref(false);
const editDialog = ref(false);
const isEditDialogAdmin = ref(false);

const form = ref(null);
const isFormValid = ref(true);

const userInit = {
  id: null,
  email: null,
  password: null,
  role: null,
  clubId: null,
};
const user = reactive({...userInit});

const openEditDialog = (selectedUser, type) => {
  if (type === "admin") {
    isEditDialogAdmin.value = true;
  }
  const {name, ...rest} = selectedUser;
  Object.assign(user, {...rest}); // avoid 'name', 'aId' from submitting backend
  editDialog.value = !editDialog.value;
};

const openAddAdminDialog = async () => {
  Object.assign(user, {...userInit});
  addAdminDialog.value = !addAdminDialog.value;
};

const handleSubmitCredential = async (type) => {
  await form.value.validate();
  if (!isFormValid.value) return;

  type = type.toLowerCase();
  user.clubId = route.params.clubId;
  if (!user.id) {
    user.password = generatePassword();
  }

  await store.dispatch("appUser/saveAppUser", {...user, type}).then(() => {
    if (type === "admin" && user.id) {
      editDialog.value = !editDialog.value;
    } else if (type === "admin" && !user.id) {
      addAdminDialog.value = !addAdminDialog.value;
    }
    Object.assign(user, {...userInit});
  });
};
const deleteAppUser = (id, type) => {
  store.dispatch("appUser/deleteAppUser", id);
};

const showGeneratedPassword = ref(false);
const handleGeneratePassword = () => {
  user.password = generatePassword();
  showGeneratedPassword.value = !showGeneratedPassword.value;
};

onMounted(() => {
  store.dispatch("appUser/setAdmins", route.params.clubId);
});
</script>

<template>
  <v-container>
    <v-row>
      <v-col>
        <page-title
          :sub-title="club?.name"
          justify="space-between"
          title="Credentials"
        >
          <v-btn
            icon="mdi-arrow-left"
            variant="text"
            @click="$router.back()"
          ></v-btn>
        </page-title>
      </v-col>

      <v-expansion-panels v-model="accordion">
        <v-expansion-panel value="admins">
          <v-expansion-panel-title>
            <span>Admins</span>
            <v-spacer></v-spacer>
            <v-btn
              class="me-5"
              color="primary"
              @click.stop="openAddAdminDialog"
            >
              Generate Credential
            </v-btn>
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <v-table v-if="admins?.length > 0" density="comfortable" hover>
              <thead>
              <tr>
                <th class="text-start">Email</th>
                <th class="text-start">Password</th>
                <th class="text-end"></th>
              </tr>
              </thead>
              <tbody>
              <tr v-for="(item, index) in admins" :key="'e-' + index">
                <td>{{ item.email }}</td>
                <td class="text-start">*********</td>
                <td class="text-start">
                  <v-menu>
                    <template v-slot:activator="{ props }">
                      <v-btn
                        icon="mdi-dots-vertical"
                        size="small"
                        v-bind="props"
                        variant="text"
                      >
                      </v-btn>
                    </template>
                    <v-list density="compact">
                      <v-list-item
                        density="compact"
                        link
                        prepend-icon="mdi-pencil"
                        title="Edit"
                        @click="openEditDialog(item, 'admin')"
                      ></v-list-item>
                      <v-divider></v-divider>
                      <confirmation-dialog
                        @confirm="deleteAppUser(item.id)"
                      >
                        <template #activator="{ onClick }">
                          <v-list-item
                            class="text-error"
                            link
                            prepend-icon="mdi-delete"
                            title="Delete"
                            @click.stop="onClick"
                          />
                        </template>
                      </confirmation-dialog>
                    </v-list>
                  </v-menu>
                </td>
              </tr>
              </tbody>
            </v-table>
            <v-alert v-else border="start" closable density="compact"
            >No Data available!
            </v-alert>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
    </v-row>
  </v-container>

  <v-dialog v-model="addAdminDialog" width="500">
    <v-card>
      <v-card-title> Generate Credential - Admin</v-card-title>
      <v-card-text>
        <v-form ref="form" v-model="isFormValid" fast-fail>
          <v-text-field
            v-model="user.email"
            :rules="[(v) => !!v || 'Email is required!']"
            class="mt-2"
            clearable
            density="compact"
            hide-details="auto"
            label="Email"
          ></v-text-field>
        </v-form>
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn color="primary" @click="handleSubmitCredential('admin')"
        >Generate
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-dialog v-model="editDialog" width="500">
    <v-card>
      <v-card-title>
        Edit Credential -
        {{ isEditDialogAdmin ? "Admin" : null }}
      </v-card-title>
      <v-card-text>
        <v-form ref="form" v-model="isFormValid" fast-fail>
          <v-text-field
            v-model="user.email"
            :rules="[(v) => !!v || 'Email is required!']"
            class="mt-2"
            clearable
            density="compact"
            hide-details="auto"
            label="Email"
          ></v-text-field>
          <v-text-field
            v-if="showGeneratedPassword"
            v-model="user.password"
            :rules="[(v) => !!v || 'Password is required!']"
            class="mt-2"
            clearable
            density="compact"
            hide-details="auto"
            label="Password"
          ></v-text-field>
          <v-btn color="primary" variant="tonal" class="mt-2" size="small" prepend-icon="mdi-recycle"
                 @click="handleGeneratePassword">
            Generate New Password
          </v-btn>
        </v-form>
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn
          color="primary"
          @click="handleSubmitCredential(isEditDialogAdmin ? 'Admin' : null)"
        >Save
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped></style>
