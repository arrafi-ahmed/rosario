import $axios from "@/plugins/axios";
import {ifAdmin} from "@/others/util";

export const namespaced = true;

export const state = {
  admins: [],
};

export const mutations = {
  setAdmins(state, payload) {
    state.admins = payload;
  },
  addAdmin(state, payload) {
    state.admins.unshift(payload);
  },
  editAdmin(state, payload) {
    const foundIndex = state.admins.findIndex((item) => item.id == payload.id);
    if (foundIndex !== -1) state.admins[foundIndex] = payload;
  },
};

export const actions = {
  saveAppUser({commit}, request) {
    const commitName =
      (request.user.id ? "edit" : "add") +
      (ifAdmin({role: request.user.role}) ? "Admin" : null);
    return new Promise((resolve, reject) => {
      $axios
        .post("/appUser/save", {payload: request.user})
        .then((response) => {
          const {password, ...rest} = response.data?.payload;
          commit(commitName, {
            ...rest,
            password: request.user.password,
          });
          resolve(response);
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
  setAdmins({commit}, request) {
    return new Promise((resolve, reject) => {
      $axios
        .get("/appUser/getAppUsers", {
          params: {clubId: request},
        })
        .then((response) => {
          response.data?.payload?.appUsers.forEach((item) => {

          })
          commit("setAdmins", response.data?.payload?.appUsers);
          resolve(response);
        })
        .catch((err) => {
          reject(err);
        });
    });
  },
};

export const getters = {};
